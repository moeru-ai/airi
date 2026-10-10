#include <QCoreApplication>
#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusMessage>
#include <QJsonDocument>
#include <QJsonObject>

#include <iostream>
#include <unistd.h>

// Test-only peer. Run solely inside dbus-run-session, never on a desktop's session bus.
int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    auto bus = QDBusConnection::sessionBus();
    const bool ownsName = argc == 2 && QByteArray(argv[1]) == "--owner";
    if (!bus.isConnected() || (ownsName && !bus.registerService("org.kde.KWin")))
        return 2;
    std::cout << QJsonDocument(QJsonObject{{"owner", bus.baseService()}, {"pid", static_cast<int>(getpid())}})
                     .toJson(QJsonDocument::Compact).constData() << std::endl;
    std::string line;
    while (std::getline(std::cin, line)) {
        const auto input = QJsonDocument::fromJson(QByteArray::fromStdString(line)).object();
        if (input["release"].toBool()) {
            bus.unregisterService("org.kde.KWin");
            std::cout << "{\"released\":true}" << std::endl;
            continue;
        }
        auto call = QDBusMessage::createMethodCall(input["destination"].toString(),
            "/org/airi/Companion", "org.airi.Companion1", "Exchange");
        const QString frame = input.contains("raw") ? input["raw"].toString()
            : QString::fromUtf8(QJsonDocument(input["frame"].toObject()).toJson(QJsonDocument::Compact));
        call << frame;
        const auto reply = bus.call(call, QDBus::Block, 1000);
        QJsonObject output;
        if (reply.type() == QDBusMessage::ErrorMessage)
            output = {{"error", reply.errorName()}};
        else if (reply.arguments().size() == 1)
            output = {{"reply", QJsonDocument::fromJson(reply.arguments()[0].toString().toUtf8()).object()}};
        std::cout << QJsonDocument(output).toJson(QJsonDocument::Compact).constData() << std::endl;
    }
    return 0;
}
