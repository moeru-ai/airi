#include "../native/protocol.h"

#include <QCoreApplication>

#include <iostream>

using namespace airi::kwin;

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    int failures = 0;
    int checks = 0;
    const auto check = [&](bool condition, const char *name) {
        ++checks;
        if (!condition) {
            ++failures;
            std::cerr << "FAIL: " << name << '\n';
        }
    };
    if (argc == 2 && QByteArray(argv[1]) == "--verify-parent-stdio") {
        check(privateParentChannel(STDIN_FILENO, getppid()), "verify Node parent stdin endpoint");
        check(privateParentChannel(STDOUT_FILENO, getppid()), "verify Node parent stdout endpoint");
        check(!privateParentChannel(STDIN_FILENO, getpid()), "reject wrong Node peer PID");
    }
    LeaseClock clock;
    check(clock.elapsed() == std::numeric_limits<qint64>::max(), "uninitialized clock fails closed");
    clock.start();
    check(clock.elapsed() >= 0 && clock.elapsed() < 1000, "Linux suspend-aware lease clock");
    check(parseFrame("{\"version\":1}").has_value(), "valid object frame");
    check(!parseFrame("[]"), "reject array frame");
    check(!parseFrame("{"), "reject malformed JSON");
    check(!parseFrame(QByteArray(8193, 'x')), "reject oversized frame");
    check(!parseFrame(QByteArray("{\"id\":\"") + char(0xff) + "\"}"), "reject malformed UTF-8");
    check(!parseFrame("{\"x\":NaN}"), "reject non-JSON NaN");
    check(!parseFrame("{\"x\":1e999}"), "reject non-finite JSON number");
    check(!parseFrame("{\"id\":1}\n{\"id\":2}"), "reject multiple JSON frames");
    check(fields(QJsonObject{{"x", 1}}, {"x"}), "exact field set");
    check(!fields(QJsonObject{{"x", 1}, {"windowId", "foreign"}}, {"x"}), "reject extra field");
    check(!fields(QJsonObject{}, {"x"}), "reject missing field");
    check(identifier("session"), "valid identifier");
    check(!identifier(""), "reject empty identifier");
    check(!identifier(QString(129, 'x')), "reject oversized identifier");
    check(!identifier(123), "reject numeric identifier");
    check(counter(1), "positive sequence");
    check(!counter(0), "reject zero sequence");
    check(!counter(1.5), "reject fractional sequence");
    check(!counter(9007199254740992.0), "reject unsafe integer sequence");
    check(!number(QStringLiteral("3"), 0, 10), "reject numeric string");
    const QJsonObject output{{"x", -1920}, {"y", -200}, {"width", 1920}, {"height", 1080}};
    const QJsonObject window{{"x", -1000}, {"y", -100}, {"width", 200}, {"height", 300}};
    check(rectangle(output), "negative origin rectangle");
    check(contains(output, window), "window inside negative origin output");
    check(pointIn(output, {{"x", -1920}, {"y", -200}}), "include leading edge");
    check(!pointIn(output, {{"x", 0}, {"y", 0}}), "exclude shared trailing edge");
    check(!contains(output, {{"x", -100}, {"y", 0}, {"width", 200}, {"height", 100}}), "reject straddled gap");
    check(!rectangle(QJsonObject{{"x", 0}, {"y", 0}, {"width", 0}, {"height", 10}}), "reject empty rectangle");
    check(!rectangle(QJsonObject{{"x", 0}, {"y", 0}, {"width", 32769}, {"height", 10}}), "reject oversized rectangle");
    const auto own = processIdentity(getpid());
    check(own.has_value(), "read own process birth identity");
    check(own && own->parent == getppid(), "read verified parent PID");
    check(own && own->birth.contains(':'), "birth identity includes boot and start time");
    check(!processIdentity(-1), "reject invalid PID");
    check(!processIdentity(2147483647), "reject absent process");
    check(descendantOf(getpid(), getppid()), "verify parent ancestry");
    check(descendantOf(getpid(), getpid()), "allow parent itself as native connection owner");
    check(!descendantOf(getppid(), getpid()), "reject inverse ancestry");
    int descriptors[2];
    const bool created = pipe(descriptors) == 0;
    check(created, "create private unnamed pipe");
    if (created) {
        check(privatePipe(descriptors[0]), "recognize inherited read pipe");
        check(privatePipe(descriptors[1]), "recognize inherited write pipe");
        check(nonblocking(descriptors[0]), "enable nonblocking pipe reads");
        check((fcntl(descriptors[0], F_GETFL) & O_NONBLOCK) != 0, "read descriptor nonblocking flag");
        close(descriptors[0]);
        close(descriptors[1]);
    }
    check(!privatePipe(-1), "reject invalid transport descriptor");
    std::cout << checks << " native protocol checks, " << failures << " failures\n";
    return failures ? 1 : 0;
}
