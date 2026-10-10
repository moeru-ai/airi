#include <QCoreApplication>
#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusMessage>
#include <QDBusReply>
#include <QDBusServiceWatcher>
#include <QDBusVirtualObject>
#include <QDateTime>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSet>
#include <QSocketNotifier>
#include <QTimer>

#include <cerrno>
#include <cmath>
#include <csignal>
#include <fcntl.h>
#include <optional>
#include <sys/stat.h>
#include <unistd.h>

#include "protocol.h"

namespace {
using namespace airi::kwin;

// One helper owns one inherited parent connection and one enrolled compositor surface.
// Configuration is accepted only through stdin. D-Bus exposes Exchange, never enrollment or arbitrary window control.
class Helper final : public QDBusVirtualObject {
public:
    explicit Helper(QObject *parent = nullptr)
        : QDBusVirtualObject(parent)
        , bus(QDBusConnection::sessionBus())
        , readNotifier(STDIN_FILENO, QSocketNotifier::Read, this)
        , writeNotifier(STDOUT_FILENO, QSocketNotifier::Write, this)
        , ownerWatcher(QStringLiteral("org.kde.KWin"), bus, QDBusServiceWatcher::WatchForOwnerChange, this)
        , parentPid(getppid())
    {
        clock.start();
        parentLease = leaseMs;
        writeNotifier.setEnabled(false);
        const auto identity = processIdentity(parentPid);
        if (!identity || !privateParentChannel(STDIN_FILENO, parentPid) || !privateParentChannel(STDOUT_FILENO, parentPid)
            || !nonblocking(STDIN_FILENO) || !nonblocking(STDOUT_FILENO)
            || !bus.isConnected() || !bus.registerVirtualObject(objectPath, this)) {
            QTimer::singleShot(0, QCoreApplication::instance(), [] { QCoreApplication::exit(2); });
            return;
        }
        parentBirth = identity->birth;
        connect(&readNotifier, &QSocketNotifier::activated, this, [this] { readParent(); });
        connect(&writeNotifier, &QSocketNotifier::activated, this, [this] { flushOutput(); });
        connect(&ownerWatcher, &QDBusServiceWatcher::serviceOwnerChanged, this,
            [this](const QString &, const QString &, const QString &newOwner) {
                if (configured && newOwner != kwinOwner)
                    stop("compositor-owner-changed");
            });
        watchdog.setInterval(25);
        connect(&watchdog, &QTimer::timeout, this, [this] { checkAlive(); });
        watchdog.start();
        output({{"version", 1}, {"type", "ready"}, {"helperOwner", bus.baseService()},
            {"parentPid", static_cast<double>(parentPid)}, {"controlAvailable", false}});
    }

    QString introspect(const QString &) const override
    {
        return QStringLiteral("<interface name=\"org.airi.Companion1\"><method name=\"Exchange\">"
            "<arg type=\"s\" direction=\"in\"/><arg type=\"s\" direction=\"out\"/></method></interface>");
    }

    bool handleMessage(const QDBusMessage &message, const QDBusConnection &connection) override
    {
        if (message.interface() != interfaceName || message.member() != "Exchange")
            return false;
        if (!checkAlive() || !configured || message.service() != kwinOwner) {
            connection.send(message.createErrorReply(QDBusError::AccessDenied, "Caller is outside the active compositor scope"));
            return true;
        }
        // Recheck current ownership before returning a command, even before the ownership signal is delivered.
        const auto currentOwner = bus.interface()->serviceOwner(QStringLiteral("org.kde.KWin"));
        const auto uid = bus.interface()->serviceUid(message.service());
        const auto pid = bus.interface()->servicePid(message.service());
        if (!currentOwner.isValid() || currentOwner.value() != kwinOwner || !uid.isValid() || !pid.isValid()
            || uid.value() != static_cast<uint>(geteuid()) || pid.value() != kwinPid) {
            stop("compositor-identity-changed");
            connection.send(message.createErrorReply(QDBusError::AccessDenied, "Compositor identity changed"));
            return true;
        }
        if (message.arguments().size() != 1 || message.arguments()[0].metaType().id() != QMetaType::QString) {
            stop("invalid-exchange-frame");
            connection.send(message.createErrorReply(QDBusError::InvalidArgs, "Expected one bounded JSON string"));
            return true;
        }
        const auto frame = parseFrame(message.arguments()[0].toString().toUtf8());
        if (!frame || !exchangeValid(*frame)) {
            stop("invalid-exchange-frame");
            connection.send(message.createErrorReply(QDBusError::InvalidArgs, "Invalid exchange"));
            return true;
        }
        const auto &request = *frame;
        const bool hello = request["kind"] == "hello";
        const qint64 now = clock.elapsed();
        if (!hello && now - lastExchange < 40) {
            stop("exchange-rate-limit");
            connection.send(message.createErrorReply(QDBusError::LimitsExceeded, "Exchange rate exceeded"));
            return true;
        }
        lastExchange = now;
        scriptLease = now + leaseMs;
        exchangeSequence = request["exchangeSequence"].toDouble();
        if (hello) {
            scriptReady = true;
            layout = request["layout"].toObject();
        }
        else if (!request["ack"].isNull()) {
            const auto ack = request["ack"].toObject();
            if (inFlight.isEmpty() || ack["requestId"] != inFlight["requestId"]) {
                stop("unexpected-acknowledgement");
                connection.send(message.createErrorReply(QDBusError::InvalidArgs, "Acknowledgement has no matching request"));
                return true;
            }
            inFlight = {};
        }
        if (!output({{"version", 1}, {"type", "exchange"}, {"sessionId", sessionId}, {"frame", request}})) {
            connection.send(message.createErrorReply(QDBusError::Disconnected, "Parent pipe is unavailable"));
            return true;
        }
        QJsonValue command(QJsonValue::Null);
        if (!hello && !queued.isEmpty()) {
            if (!fresh(queued["createdAtMs"])) {
                stop("queued-request-stale");
            }
            else {
                inFlight = queued;
                queued = {};
                command = inFlight;
                // Allow compositor readback (300 ms), one poll interval, and bounded D-Bus delivery time.
                commandDeadline = now + 750;
            }
        }
        const QJsonObject reply{{"version", 1}, {"kind", hello ? "ready" : "poll"}, {"sessionId", sessionId},
            {"exchangeSequence", exchangeSequence}, {"layoutRevision", revision},
            {"status", stopped ? "disabled" : "active"}, {"reason", stopReason},
            {"command", stopped ? QJsonValue(QJsonValue::Null) : command}};
        connection.send(message.createReply(QString::fromUtf8(encode(reply))));
        return true;
    }

private:
    QDBusConnection bus;
    QSocketNotifier readNotifier;
    QSocketNotifier writeNotifier;
    QDBusServiceWatcher ownerWatcher;
    QTimer watchdog;
    LeaseClock clock;
    QByteArray input;
    QByteArray pendingOutput;
    qint64 parentPid;
    QString parentBirth;
    qint64 clientPid = 0;
    QString clientBirth;
    QString sessionId;
    QString surfaceId;
    QString windowId;
    QString kwinOwner;
    uint kwinPid = 0;
    double revision = 0;
    double exchangeSequence = 0;
    double geometrySequence = 0;
    double sampleSequence = 0;
    qint64 parentLease = 0;
    qint64 scriptLease = 0;
    qint64 lastExchange = -1000;
    qint64 lastGeometry = -1000;
    qint64 commandDeadline = 0;
    QJsonObject layout;
    QJsonObject queued;
    QJsonObject inFlight;
    bool configured = false;
    bool scriptReady = false;
    bool stopped = false;
    QString stopReason;

    bool fresh(const QJsonValue &timestamp) const
    {
        const qint64 now = QDateTime::currentMSecsSinceEpoch();
        return number(timestamp, 0, 9007199254740991.0) && timestamp.toDouble() <= now
            && now - timestamp.toDouble() <= 250;
    }

    bool validLayout(const QJsonValue &value) const
    {
        const auto object = value.toObject();
        if (!value.isObject() || !fields(object, {"coordinateSpace", "revision", "outputs"})
            || object["coordinateSpace"] != "kwin-logical-desktop" || object["revision"] != revision
            || !object["outputs"].isArray())
            return false;
        const auto outputs = object["outputs"].toArray();
        if (outputs.isEmpty() || outputs.size() > 32)
            return false;
        QSet<QString> ids;
        for (const auto &value : outputs) {
            const auto output = value.toObject();
            if (!value.isObject() || !fields(output, {"id", "bounds", "workArea", "scale"})
                || !identifier(output["id"]) || ids.contains(output["id"].toString())
                || !rectangle(output["bounds"]) || !rectangle(output["workArea"])
                || !contains(output["bounds"].toObject(), output["workArea"].toObject())
                || !number(output["scale"], 0.25, 8))
                return false;
            ids.insert(output["id"].toString());
        }
        return true;
    }

    bool sampleValid(const QJsonValue &value)
    {
        if (value.isNull())
            return true;
        const auto sample = value.toObject();
        const auto position = sample["position"].toObject();
        if (!value.isObject() || !fields(sample, {"coordinateSpace", "source", "sessionId", "sequence", "layoutRevision", "capturedAtMs", "position", "outputId"})
            || sample["coordinateSpace"] != "kwin-logical-desktop" || sample["source"] != "kwin-companion-experiment"
            || sample["sessionId"] != sessionId || sample["layoutRevision"] != revision
            || !counter(sample["sequence"]) || sample["sequence"].toDouble() <= sampleSequence
            || !fresh(sample["capturedAtMs"]) || !fields(position, {"x", "y"})
            || !number(position["x"], -1000000, 1000000) || !number(position["y"], -1000000, 1000000))
            return false;
        bool onOutput = false;
        for (const auto &value : layout["outputs"].toArray()) {
            const auto output = value.toObject();
            if (output["id"] == sample["outputId"] && pointIn(output["bounds"].toObject(), position))
                onOutput = true;
        }
        if (onOutput)
            sampleSequence = sample["sequence"].toDouble();
        return onOutput;
    }

    bool ackValid(const QJsonValue &value) const
    {
        if (value.isNull())
            return true;
        const auto ack = value.toObject();
        return value.isObject() && fields(ack, {"requestId", "sessionId", "layoutRevision", "outcome", "reason", "observedBounds"})
            && identifier(ack["requestId"]) && ack["sessionId"] == sessionId && ack["layoutRevision"] == revision
            && QStringList{"applied", "rejected", "cancelled", "unconfirmed"}.contains(ack["outcome"].toString())
            && identifier(ack["reason"]) && (ack["observedBounds"].isNull() || rectangle(ack["observedBounds"]));
    }

    bool exchangeValid(const QJsonObject &request)
    {
        if (request["version"] != 1 || request["sessionId"] != sessionId
            || !counter(request["exchangeSequence"]) || request["exchangeSequence"].toDouble() <= exchangeSequence
            || request["layoutRevision"] != revision)
            return false;
        if (request["kind"] == "hello") {
            return !scriptReady && fields(request, {"version", "kind", "sessionId", "exchangeSequence", "layoutRevision", "windowId", "layout"})
                && request["windowId"] == windowId && validLayout(request["layout"]);
        }
        return scriptReady && request["kind"] == "poll"
            && fields(request, {"version", "kind", "sessionId", "exchangeSequence", "layoutRevision", "sample", "ack"})
            && sampleValid(request["sample"]) && ackValid(request["ack"]);
    }

    bool geometryValid(const QJsonObject &request) const
    {
        if (!fields(request, {"version", "sessionId", "surfaceId", "requestId", "sequence", "layoutRevision", "createdAtMs", "bounds"})
            || request["version"] != 1 || request["sessionId"] != sessionId || request["surfaceId"] != surfaceId
            || !identifier(request["requestId"]) || !counter(request["sequence"])
            || request["sequence"].toDouble() <= geometrySequence || request["layoutRevision"] != revision
            || !fresh(request["createdAtMs"]) || !rectangle(request["bounds"]))
            return false;
        for (const auto &value : layout["outputs"].toArray()) {
            if (contains(value.toObject()["workArea"].toObject(), request["bounds"].toObject()))
                return true;
        }
        return false;
    }

    void configure(const QJsonObject &frame)
    {
        const auto process = frame["process"].toObject();
        const auto expectedPeer = frame["kwinPeer"].toObject();
        if (configured || !fields(frame, {"version", "op", "sessionId", "surfaceId", "windowId", "resourceClass", "process", "layoutRevision", "nativeMapping", "kwinPeer"})
            || !identifier(frame["sessionId"]) || !identifier(frame["surfaceId"]) || !identifier(frame["windowId"])
            || !identifier(frame["resourceClass"]) || !counter(frame["layoutRevision"])
            || frame["nativeMapping"] != "verified-main-registry-v1"
            || !fields(expectedPeer, {"uniqueOwner", "pid", "uid"})
            || !identifier(expectedPeer["uniqueOwner"]) || !number(expectedPeer["pid"], 1, 2147483647, true)
            || !number(expectedPeer["uid"], 0, 4294967295.0, true)
            || !fields(process, {"pid", "birthId"}) || !number(process["pid"], 1, 2147483647, true) || !identifier(process["birthId"])) {
            stop("native-enrollment-required");
            return;
        }
        clientPid = static_cast<qint64>(process["pid"].toDouble());
        const auto identity = processIdentity(clientPid);
        if (!identity || identity->birth != process["birthId"].toString() || !descendantOf(clientPid, parentPid)) {
            stop("process-enrollment-rejected");
            return;
        }
        const auto owner = bus.interface()->serviceOwner(QStringLiteral("org.kde.KWin"));
        if (!owner.isValid()) {
            stop("compositor-unavailable");
            return;
        }
        const auto uid = bus.interface()->serviceUid(owner.value());
        const auto pid = bus.interface()->servicePid(owner.value());
        if (!uid.isValid() || uid.value() != static_cast<uint>(geteuid()) || !pid.isValid() || pid.value() == 0
            || owner.value() != expectedPeer["uniqueOwner"].toString()
            || uid.value() != expectedPeer["uid"].toDouble() || pid.value() != expectedPeer["pid"].toDouble()) {
            stop("compositor-identity-unavailable");
            return;
        }
        kwinOwner = owner.value();
        kwinPid = pid.value();
        clientBirth = identity->birth;
        sessionId = frame["sessionId"].toString();
        surfaceId = frame["surfaceId"].toString();
        windowId = frame["windowId"].toString();
        revision = frame["layoutRevision"].toDouble();
        configured = true;
        parentLease = clock.elapsed() + leaseMs;
        scriptLease = parentLease;
        output({{"version", 1}, {"type", "configured"}, {"sessionId", sessionId},
            {"kwinOwner", kwinOwner}, {"kwinPid", static_cast<double>(kwinPid)}, {"kwinUid", static_cast<double>(uid.value())}});
    }

    void parentFrame(const QJsonObject &frame)
    {
        if (!checkAlive())
            return;
        if (frame["version"] != 1) {
            stop("protocol-version-mismatch");
            return;
        }
        if (frame["op"] == "configure") {
            configure(frame);
            return;
        }
        if (!configured) {
            stop("native-enrollment-required");
            return;
        }
        if (frame["op"] == "heartbeat" || frame["op"] == "disable") {
            if (!fields(frame, {"version", "op", "sessionId"}) || frame["sessionId"] != sessionId) {
                stop("invalid-parent-frame");
                return;
            }
            if (frame["op"] == "disable")
                stop("user-disabled");
            else
                parentLease = clock.elapsed() + leaseMs;
            return;
        }
        const auto request = frame["request"].toObject();
        if (frame["op"] != "geometry" || !fields(frame, {"version", "op", "request"}) || !scriptReady
            || !frame["request"].isObject() || !geometryValid(request)) {
            stop("invalid-geometry-request");
            return;
        }
        if (!queued.isEmpty() || !inFlight.isEmpty() || clock.elapsed() - lastGeometry < 50) {
            stop("geometry-backpressure");
            return;
        }
        geometrySequence = request["sequence"].toDouble();
        lastGeometry = clock.elapsed();
        queued = request;
    }

    void readParent()
    {
        char buffer[4096];
        qsizetype readThisTurn = 0;
        while (!stopped && readThisTurn < maxOutputBytes) {
            const ssize_t count = ::read(STDIN_FILENO, buffer, sizeof(buffer));
            if (count == 0) {
                stop("parent-eof");
                return;
            }
            if (count < 0) {
                if (errno == EINTR)
                    continue;
                if (errno != EAGAIN && errno != EWOULDBLOCK)
                    stop("parent-read-failed");
                return;
            }
            readThisTurn += count;
            input.append(buffer, count);
            qsizetype newline;
            while (!stopped && (newline = input.indexOf('\n')) >= 0) {
                const auto frame = parseFrame(input.left(newline));
                input.remove(0, newline + 1);
                if (!frame) {
                    stop("invalid-parent-frame");
                    return;
                }
                parentFrame(*frame);
            }
            if (input.size() > maxFrameBytes) {
                stop("parent-frame-too-large");
                return;
            }
        }
    }

    bool output(const QJsonObject &frame)
    {
        const auto bytes = encode(frame) + '\n';
        if (pendingOutput.size() + bytes.size() > maxOutputBytes) {
            stop("parent-output-backpressure", false);
            return false;
        }
        pendingOutput += bytes;
        flushOutput();
        return !stopped;
    }

    void flushOutput()
    {
        while (!pendingOutput.isEmpty()) {
            const ssize_t count = ::write(STDOUT_FILENO, pendingOutput.constData(), pendingOutput.size());
            if (count < 0) {
                if (errno == EINTR)
                    continue;
                if (errno == EAGAIN || errno == EWOULDBLOCK) {
                    writeNotifier.setEnabled(true);
                    return;
                }
                stop("parent-write-failed", false);
                return;
            }
            if (count == 0) {
                stop("parent-write-failed", false);
                return;
            }
            pendingOutput.remove(0, count);
        }
        writeNotifier.setEnabled(false);
    }

    bool checkAlive()
    {
        if (stopped)
            return false;
        const auto identity = processIdentity(parentPid);
        const auto client = configured ? processIdentity(clientPid) : std::optional<Process>{};
        const qint64 now = clock.elapsed();
        if (getppid() != parentPid || !identity || identity->birth != parentBirth)
            stop("parent-exited");
        else if (now >= parentLease)
            stop("parent-lease-expired");
        else if (configured && (!client || client->birth != clientBirth || !descendantOf(clientPid, parentPid)))
            stop("process-identity-revoked");
        else if (configured && now >= scriptLease)
            stop("script-lease-expired");
        else if (!inFlight.isEmpty() && now >= commandDeadline)
            stop("geometry-acknowledgement-timeout");
        else if (!queued.isEmpty() && !fresh(queued["createdAtMs"]))
            stop("queued-request-stale");
        return !stopped;
    }

    void stop(const QString &reason, bool report = true)
    {
        if (stopped)
            return;
        stopped = true;
        stopReason = reason;
        queued = {};
        inFlight = {};
        input.clear();
        readNotifier.setEnabled(false);
        writeNotifier.setEnabled(false);
        watchdog.stop();
        if (!report)
            pendingOutput.clear();
        if (report && pendingOutput.size() < maxOutputBytes - 1024)
            output({{"version", 1}, {"type", "disabled"}, {"reason", reason}});
        // Exit is bounded even when the parent stopped reading. No queued command survives this state.
        QTimer::singleShot(25, QCoreApplication::instance(), [] { QCoreApplication::exit(0); });
    }
};
} // namespace

/**
 * Private process entry point. No command-line arguments accept credentials, windows, or destinations.
 * Call stack: main -> Helper -> parentFrame / handleMessage -> bounded private pipes / D-Bus reply.
 */
int main(int argc, char **argv)
{
    std::signal(SIGPIPE, SIG_IGN);
    QCoreApplication app(argc, argv);
    if (argc != 1)
        return 2;
    Helper helper;
    return app.exec();
}
