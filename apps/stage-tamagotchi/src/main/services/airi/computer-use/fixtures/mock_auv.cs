// Test fixture: Mock AUV binary source for Windows native process tests.
// Used by real-process-issue2.test.ts to test child process lifecycle and stdio drainage.
// Compiled on-demand via C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe during test execution.
// Platform: win32 only.
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class MockAuv {
    static int Main(string[] args) {
        // Read stdin until newline
        try {
            Console.ReadLine();
        } catch {}

        string mode = Environment.GetEnvironmentVariable("MOCK_AUV_MODE") ?? "normal";

        if (mode == "leak_stdio") {
            // Spawn a grandchild process that inherits handles and sleeps
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -Command \"Start-Sleep -Seconds 5\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            // Inherit standard output and error handles
            Process gc = Process.Start(psi);

            // Print valid json response from direct child with grandchild PID
            Console.WriteLine("{\"activated\": true, \"mode\": \"leak_stdio\", \"grandchildPid\": " + gc.Id + "}");
            Console.Out.Flush();

            // Direct child exits immediately with code 0!
            return 0;
        }

        Console.WriteLine("{\"activated\": true, \"mode\": \"normal\"}");
        return 0;
    }
}
