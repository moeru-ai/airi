#pragma once

#include <QByteArray>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSet>
#include <QString>

#include <cmath>
#include <fcntl.h>
#include <limits>
#include <optional>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

// Bounded JSON and Linux process identity checks shared by the optional native transport.
namespace airi::kwin {
constexpr qsizetype maxFrameBytes = 8192;
constexpr qsizetype maxOutputBytes = 65536;
constexpr qint64 leaseMs = 1000;
inline const QString objectPath = QStringLiteral("/org/airi/Companion");
inline const QString interfaceName = QStringLiteral("org.airi.Companion1");

// Linux BOOTTIME includes suspend. A late wake cannot extend a lease that expired while the machine slept.
// Source: https://man7.org/linux/man-pages/man2/clock_gettime.2.html
class LeaseClock {
public:
    void start() { origin = read(); }
    qint64 elapsed() const
    {
        const auto now = read();
        if (!origin || !now || *now < *origin)
            return std::numeric_limits<qint64>::max();
        return *now - *origin;
    }

private:
    std::optional<qint64> origin;
    static std::optional<qint64> read()
    {
        timespec time {};
        if (clock_gettime(CLOCK_BOOTTIME, &time) != 0)
            return std::nullopt;
        return static_cast<qint64>(time.tv_sec) * 1000 + time.tv_nsec / 1000000;
    }
};

inline bool fields(const QJsonObject &object, std::initializer_list<const char *> keys)
{
    if (object.size() != static_cast<qsizetype>(keys.size()))
        return false;
    for (const auto *key : keys) {
        if (!object.contains(QLatin1String(key)))
            return false;
    }
    return true;
}

inline bool identifier(const QJsonValue &value)
{
    return value.isString() && !value.toString().isEmpty() && value.toString().size() <= 128;
}

inline bool number(const QJsonValue &value, double minimum, double maximum, bool integral = false)
{
    const double result = value.toDouble(std::numeric_limits<double>::quiet_NaN());
    return value.isDouble() && std::isfinite(result) && result >= minimum && result <= maximum
        && (!integral || std::floor(result) == result);
}

inline bool counter(const QJsonValue &value)
{
    return number(value, 1, 9007199254740991.0, true);
}

inline bool rectangle(const QJsonValue &value)
{
    const auto rect = value.toObject();
    return value.isObject() && fields(rect, {"x", "y", "width", "height"})
        && number(rect["x"], -1000000, 1000000) && number(rect["y"], -1000000, 1000000)
        && number(rect["width"], 1, 32768) && number(rect["height"], 1, 32768);
}

inline bool contains(const QJsonObject &outer, const QJsonObject &inner)
{
    return inner["x"].toDouble() >= outer["x"].toDouble()
        && inner["y"].toDouble() >= outer["y"].toDouble()
        && inner["x"].toDouble() + inner["width"].toDouble() <= outer["x"].toDouble() + outer["width"].toDouble()
        && inner["y"].toDouble() + inner["height"].toDouble() <= outer["y"].toDouble() + outer["height"].toDouble();
}

inline bool pointIn(const QJsonObject &rect, const QJsonObject &point)
{
    return point["x"].toDouble() >= rect["x"].toDouble() && point["y"].toDouble() >= rect["y"].toDouble()
        && point["x"].toDouble() < rect["x"].toDouble() + rect["width"].toDouble()
        && point["y"].toDouble() < rect["y"].toDouble() + rect["height"].toDouble();
}

inline std::optional<QJsonObject> parseFrame(const QByteArray &bytes)
{
    if (bytes.isEmpty() || bytes.size() > maxFrameBytes)
        return std::nullopt;
    // Reject malformed UTF-8 instead of allowing replacement characters into identifiers.
    if (QString::fromUtf8(bytes).toUtf8() != bytes)
        return std::nullopt;
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(bytes, &error);
    if (error.error != QJsonParseError::NoError || !document.isObject())
        return std::nullopt;
    return document.object();
}

inline QByteArray encode(const QJsonObject &object)
{
    return QJsonDocument(object).toJson(QJsonDocument::Compact);
}

struct Process {
    qint64 parent;
    QString birth;
};

inline std::optional<Process> processIdentity(qint64 pid)
{
    QFile stat(QStringLiteral("/proc/%1/stat").arg(pid));
    QFile boot(QStringLiteral("/proc/sys/kernel/random/boot_id"));
    if (pid <= 0 || !stat.open(QIODevice::ReadOnly) || !boot.open(QIODevice::ReadOnly))
        return std::nullopt;
    const auto bytes = stat.read(8192);
    // The comm field can contain spaces and parentheses. Fields after its final ')' are stable.
    const qsizetype close = bytes.lastIndexOf(')');
    if (close < 0)
        return std::nullopt;
    const auto parts = bytes.mid(close + 2).simplified().split(' ');
    if (parts.size() < 20)
        return std::nullopt;
    bool parentOk = false;
    bool startOk = false;
    const qint64 parent = parts[1].toLongLong(&parentOk);
    parts[19].toULongLong(&startOk);
    if (!parentOk || !startOk)
        return std::nullopt;
    return Process{parent, QString::fromLatin1(boot.read(128).trimmed()) + ":" + QString::fromLatin1(parts[19])};
}

inline bool descendantOf(qint64 pid, qint64 root)
{
    QSet<qint64> visited;
    for (int depth = 0; depth < 32 && pid > 0 && !visited.contains(pid); ++depth) {
        if (pid == root)
            return true;
        visited.insert(pid);
        const auto process = processIdentity(pid);
        if (!process)
            return false;
        pid = process->parent;
    }
    return false;
}

inline bool privatePipe(int fd)
{
    struct stat status {};
    if (fstat(fd, &status) != 0 || !S_ISFIFO(status.st_mode))
        return false;
    const auto path = QByteArray("/proc/self/fd/") + QByteArray::number(fd);
    char destination[256];
    const ssize_t size = readlink(path.constData(), destination, sizeof(destination));
    return size > 0 && QByteArray(destination, size).startsWith("pipe:[");
}

// Node's stdio:'pipe' can use unnamed Unix socketpairs. Verify their actual peer instead of accepting named endpoints.
inline bool privateParentChannel(int fd, qint64 parentPid)
{
    if (privatePipe(fd))
        return true;
    struct stat status {};
    if (fstat(fd, &status) != 0 || !S_ISSOCK(status.st_mode))
        return false;
    sockaddr_un local {};
    sockaddr_un remote {};
    socklen_t localSize = sizeof(local);
    socklen_t remoteSize = sizeof(remote);
    ucred credentials {};
    socklen_t credentialSize = sizeof(credentials);
    int type = 0;
    socklen_t typeSize = sizeof(type);
    return getsockname(fd, reinterpret_cast<sockaddr *>(&local), &localSize) == 0
        && getpeername(fd, reinterpret_cast<sockaddr *>(&remote), &remoteSize) == 0
        && local.sun_family == AF_UNIX && remote.sun_family == AF_UNIX
        && localSize == sizeof(sa_family_t) && remoteSize == sizeof(sa_family_t)
        && getsockopt(fd, SOL_SOCKET, SO_TYPE, &type, &typeSize) == 0 && type == SOCK_STREAM
        && getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &credentials, &credentialSize) == 0
        && credentialSize == sizeof(credentials) && credentials.pid == parentPid && credentials.uid == geteuid();
}

inline bool nonblocking(int fd)
{
    const int flags = fcntl(fd, F_GETFL);
    return flags >= 0 && fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0;
}

} // namespace airi::kwin
