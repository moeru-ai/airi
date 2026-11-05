using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

// This probe reads process tokens and desktop context. It has no input or desktop-switch API.
internal static class EnvironmentProbe
{
    [StructLayout(LayoutKind.Sequential)] struct UserFlags { public int Inherit, Reserved; public uint Flags; }
    delegate bool EnumWindow(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr GetThreadDesktop(uint thread);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ProcessIdToSessionId(uint pid, out uint session);
    [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, uint length, out uint needed);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetUserObjectInformationW", SetLastError = true)] static extern bool ObjectName(IntPtr handle, int kind, StringBuilder value, uint size, out uint needed);
    [DllImport("user32.dll", EntryPoint = "GetUserObjectInformationW", SetLastError = true)] static extern bool ObjectFlags(IntPtr handle, int kind, out UserFlags value, uint size, out uint needed);
    [DllImport("user32.dll", EntryPoint = "GetUserObjectInformationW", SetLastError = true)] static extern bool ObjectInteger(IntPtr handle, int kind, out uint value, uint size, out uint needed);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenDesktop(string name, uint flags, bool inherit, uint access);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("kernelbase.dll")] static extern bool CompareObjectHandles(IntPtr first, IntPtr second);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", SetLastError = true)] static extern bool EnumDesktopWindows(IntPtr desktop, EnumWindow callback, IntPtr data);
    [DllImport("wtsapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool WTSQuerySessionInformation(IntPtr server, uint session, int kind, out IntPtr buffer, out uint length);
    [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr buffer);

    static IntPtr observerDesktop;
    static bool comparisonSupported;
    static string Name(IntPtr handle) {
        var value = new StringBuilder(256); uint needed;
        if (handle == IntPtr.Zero || !ObjectName(handle, 2, value, 512, out needed)) throw new Win32Exception();
        return value.ToString();
    }
    static object Desktop(IntPtr handle) {
        if (handle == IntPtr.Zero) return new { available = false, error = Marshal.GetLastWin32Error() };
        uint input, needed;
        bool read = ObjectInteger(handle, 6, out input, 4, out needed);
        int? error = read ? null : (int?)Marshal.GetLastWin32Error();
        return new { available = true, name = Name(handle), receivesInput = read ? (bool?)(input != 0) : null,
            inputQueryError = error, sameAsObserverDesktop = comparisonSupported ? (bool?)CompareObjectHandles(handle, observerDesktop) : null };
    }
    static object InputDesktop(uint access) {
        IntPtr handle = OpenInputDesktop(0, false, access);
        int? error = handle == IntPtr.Zero ? (int?)Marshal.GetLastWin32Error() : null;
        object desktop = handle == IntPtr.Zero ? null : Desktop(handle);
        bool closed = handle != IntPtr.Zero && CloseDesktop(handle);
        return new { access = "0x" + access.ToString("X"), opened = handle != IntPtr.Zero, error, desktop, ownedHandleClosed = closed };
    }
    static object SessionState(uint session) {
        IntPtr buffer; uint length;
        if (!WTSQuerySessionInformation(IntPtr.Zero, session, 8, out buffer, out length)) return new { error = Marshal.GetLastWin32Error() };
        try {
            int state = Marshal.ReadInt32(buffer);
            string[] names = { "Active", "Connected", "ConnectQuery", "Shadow", "Disconnected", "Idle", "Listen", "Reset", "Down", "Init" };
            return new { value = state, name = state >= 0 && state < names.Length ? names[state] : "Unknown" };
        }
        finally { WTSFreeMemory(buffer); }
    }
    static T TokenValue<T>(IntPtr token, int kind, Func<IntPtr, T> read) {
        uint needed;
        GetTokenInformation(token, kind, IntPtr.Zero, 0, out needed);
        if (needed == 0 || needed > 65536) throw new Win32Exception();
        IntPtr buffer = Marshal.AllocHGlobal((int)needed);
        try {
            if (!GetTokenInformation(token, kind, buffer, needed, out needed)) throw new Win32Exception();
            return read(buffer);
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }
    static object Security(uint pid) {
        IntPtr process = OpenProcess(0x1000, false, pid), token = IntPtr.Zero;
        try {
            if (process == IntPtr.Zero || !OpenProcessToken(process, 8, out token)) throw new Win32Exception();
            uint rid = TokenValue(token, 25, buffer => {
                IntPtr sid = Marshal.ReadIntPtr(buffer);
                byte count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
                if (count == 0) throw new InvalidOperationException("Integrity SID has no subauthority.");
                return (uint)Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)count - 1));
            });
            string level = rid >= 0x4000 ? "SystemOrHigher" : rid >= 0x3000 ? "High" : rid >= 0x2000 ? "Medium" : rid >= 0x1000 ? "Low" : "Untrusted";
            return new { integrityRid = rid, integrityLevel = level,
                tokenSessionId = TokenValue(token, 12, buffer => Marshal.ReadInt32(buffer)),
                elevated = TokenValue(token, 20, buffer => Marshal.ReadInt32(buffer) != 0),
                uiAccess = TokenValue(token, 26, buffer => Marshal.ReadInt32(buffer) != 0) };
        }
        catch (Exception error) { return new { error = error.ToString() }; }
        finally {
            if (token != IntPtr.Zero) CloseHandle(token);
            if (process != IntPtr.Zero) CloseHandle(process);
        }
    }
    static object ProcessContext(uint pid) {
        uint session;
        if (!ProcessIdToSessionId(pid, out session)) return new { pid, error = Marshal.GetLastWin32Error() };
        try {
            using (var process = Process.GetProcessById((int)pid)) {
                var threads = new List<object>();
                foreach (ProcessThread thread in process.Threads) {
                    if (threads.Count == 256) throw new InvalidOperationException("Unexpected peer thread count.");
                    threads.Add(new { tid = thread.Id, desktop = Desktop(GetThreadDesktop((uint)thread.Id)) });
                }
                return new { pid, sessionId = session, sessionState = SessionState(session), security = Security(pid),
                    executable = process.MainModule.FileName, processStartedUtc = process.StartTime.ToUniversalTime().ToString("o"), threads };
            }
        }
        catch (Exception error) { return new { pid, sessionId = session, error = error.ToString() }; }
    }

    static int Run(string[] args) {
        if (args.Length < 1) return 2;
        var pids = new HashSet<uint>(); var windows = new List<object>();
        uint ownPid = (uint)Process.GetCurrentProcess().Id;
        observerDesktop = GetThreadDesktop(GetCurrentThreadId());
        string comparisonError = null;
        IntPtr independentlyOpened = OpenDesktop(Name(observerDesktop), 0, false, 1);
        try {
            comparisonSupported = independentlyOpened != IntPtr.Zero && CompareObjectHandles(observerDesktop, independentlyOpened);
        }
        catch (EntryPointNotFoundException error) { comparisonError = error.Message; }
        finally { if (independentlyOpened != IntPtr.Zero) CloseDesktop(independentlyOpened); }
        for (int index = 1; index < args.Length; index += 2) {
            if (index + 1 == args.Length) return 2;
            if (args[index] == "--pid") pids.Add(UInt32.Parse(args[index + 1]));
            else if (args[index] == "--hwnd") {
                var hwnd = new IntPtr(Int64.Parse(args[index + 1])); uint pid;
                uint tid = GetWindowThreadProcessId(hwnd, out pid);
                windows.Add(new { hwnd = args[index + 1], exists = IsWindow(hwnd), pid, tid, desktop = Desktop(GetThreadDesktop(tid)) });
                pids.Add(pid);
            }
            else return 2;
        }
        uint needed; UserFlags flags;
        IntPtr station = GetProcessWindowStation();
        if (!ObjectFlags(station, 1, out flags, (uint)Marshal.SizeOf(typeof(UserFlags)), out needed)) throw new Win32Exception();
        int visible = 0, otherVisible = 0;
        EnumWindow counter = delegate(IntPtr window, IntPtr data) {
            if (IsWindowVisible(window)) {
                visible++; uint pid; GetWindowThreadProcessId(window, out pid);
                if (pid != ownPid && !pids.Contains(pid)) otherVisible++;
            }
            return true;
        };
        bool enumerated = EnumDesktopWindows(observerDesktop, counter, IntPtr.Zero);
        int? enumerationError = enumerated ? null : (int?)Marshal.GetLastWin32Error();
        var peers = new List<object>();
        foreach (uint pid in pids) peers.Add(ProcessContext(pid));
        File.WriteAllText(args[0], new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 }.Serialize(new {
            timestamp = DateTime.UtcNow.ToString("o"), observer = ProcessContext(ownPid),
            observerStation = Name(station), stationVisible = (flags.Flags & 1) != 0,
            observerDesktop = Desktop(observerDesktop), consoleSessionId = WTSGetActiveConsoleSessionId(),
            inputDesktopRead = InputDesktop(1), inputDesktopDriverAccess = InputDesktop(0x000F01FF),
            desktopComparisonCalibrated = comparisonSupported, comparisonError, peers, windows,
            desktopWindowCount = new { enumerated, enumerationError, visible, visibleOutsideSuppliedPeers = otherVisible },
            scope = "Point-in-time read-only context, not input permission or target lifetime binding."
        }));
        GC.KeepAlive(counter);
        return 0;
    }

    [STAThread]
    static int Main(string[] args) {
        try { return Run(args); }
        catch (Exception error) {
            if (args.Length > 0) File.WriteAllText(args[0], new JavaScriptSerializer().Serialize(new { error = error.ToString() }));
            return 1;
        }
    }
}
