using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Owns only disposable, noninteractive test objects. It never switches the input desktop.
internal static class StationLauncher
{
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct UserFlags { public int Inherit, Reserved; public uint Flags; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
        public uint Size; public string Reserved, Desktop, Title; public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
        public ushort Show, ReservedSize; public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Pid, Tid; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorking, MaxWorking; public uint Processes;
        public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong Read, Write, Other, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct JobLimits { public BasicLimits Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob; }
    [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Window; public uint Id; public UIntPtr Wparam; public IntPtr Lparam; public uint Time; public Point Point; public uint Private; }
    delegate void WinEvent(IntPtr hook, uint kind, IntPtr hwnd, int obj, int child, uint thread, uint time);
    [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
    [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint thread);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateWindowStation(string name, uint flags, uint access, IntPtr security);
    [DllImport("user32.dll", SetLastError = true)] static extern bool SetProcessWindowStation(IntPtr station);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr mode, uint flags, uint access, IntPtr security);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseWindowStation(IntPtr station);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenWindowStation(string name, bool inherit, uint access);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetUserObjectInformationW", SetLastError = true)] static extern bool ObjectName(IntPtr handle, int index, StringBuilder value, uint size, out uint needed);
    [DllImport("user32.dll", EntryPoint = "GetUserObjectInformationW", SetLastError = true)] static extern bool ObjectFlags(IntPtr handle, int index, out UserFlags value, uint size, out uint needed);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string application, StringBuilder command, IntPtr procSecurity, IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string directory, ref Startup startup, out ProcessInfo process);
    [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref JobLimits value, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEvent callback, uint pid, uint thread, uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message message);

    static string Name(IntPtr handle) {
        var value = new StringBuilder(256); uint needed;
        if (!ObjectName(handle, 2, value, 512, out needed)) throw new Win32Exception();
        return value.ToString();
    }
    static object Identity() {
        uint needed; UserFlags flags;
        IntPtr station = GetProcessWindowStation();
        if (!ObjectFlags(station, 1, out flags, (uint)Marshal.SizeOf(typeof(UserFlags)), out needed)) throw new Win32Exception();
        IntPtr input = OpenInputDesktop(0, false, 0x000F01FF);
        int? inputError = input == IntPtr.Zero ? (int?)Marshal.GetLastWin32Error() : null;
        string inputName = input == IntPtr.Zero ? null : Name(input);
        if (input != IntPtr.Zero) CloseDesktop(input);
        return new { pid = Process.GetCurrentProcess().Id, station = Name(station), desktop = Name(GetThreadDesktop(GetCurrentThreadId())),
            stationVisible = (flags.Flags & 1) != 0, canOpenInputDesktop = input != IntPtr.Zero, inputName, inputError };
    }
    static object Foreground() {
        IntPtr hwnd = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(hwnd, out pid);
        Point point; bool cursorReadable = GetCursorPos(out point);
        return new { hwnd = hwnd.ToInt64().ToString(), pid, cursor = new { x = point.X, y = point.Y, readable = cursorReadable } };
    }
    static string Quote(string value) {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes); result.Append(c); slashes = 0;
        }
        result.Append('\\', slashes * 2); return result.Append('"').ToString();
    }
    static void Require(bool ok) { if (!ok) throw new Win32Exception(); }
    static void Write(string file, object value) { File.WriteAllText(file, new JavaScriptSerializer().Serialize(value)); }

    static int Witness(string root) {
        var before = Foreground(); var identity = Identity(); var events = new List<object>();
        WinEvent callback = delegate(IntPtr h, uint kind, IntPtr hwnd, int obj, int id, uint tid, uint time) { events.Add(new { time, foreground = Foreground() }); };
        Message message; PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
        IntPtr hook = SetWinEventHook(3, 3, IntPtr.Zero, callback, 0, 0, 0); Require(hook != IntPtr.Zero);
        Write(Path.Combine(root, "witness-ready.json"), new { identity, before });
        var clock = Stopwatch.StartNew();
        while (!File.Exists(Path.Combine(root, "witness-stop")) && clock.Elapsed.TotalSeconds < 180) {
            while (PeekMessage(out message, IntPtr.Zero, 0, 0, 1)) { TranslateMessage(ref message); DispatchMessage(ref message); }
            Thread.Sleep(10);
        }
        UnhookWinEvent(hook); GC.KeepAlive(callback);
        Write(Path.Combine(root, "interactive-witness.json"), new { identity, before, after = Foreground(), events });
        return 0;
    }

    [STAThread]
    static int Main(string[] args) {
        if (args.Length == 2 && args[0] == "--probe") { Write(args[1], Identity()); return 0; }
        if (args.Length == 2 && args[0] == "--witness") return Witness(args[1]);
        if (args.Length == 3 && args[0] == "--verify-closed") {
            IntPtr opened = OpenWindowStation(args[1], false, 2); int error = Marshal.GetLastWin32Error();
            if (opened != IntPtr.Zero) CloseWindowStation(opened);
            Write(args[2], new { station = args[1], exists = opened != IntPtr.Zero, error });
            return opened == IntPtr.Zero ? 0 : 1;
        }
        if (args.Length != 4) return 2;
        string root = args[0], stationName = "airi-phase3b2a-" + Guid.NewGuid().ToString("N");
        Directory.CreateDirectory(root);
        IntPtr station = IntPtr.Zero, desktop = IntPtr.Zero, job = IntPtr.Zero;
        ProcessInfo child = new ProcessInfo(); uint exitCode = 1; string failure = null;
        var origin = Identity();
        bool assigned = false, desktopClosed = false; string stage = "create-station";
        try {
            station = CreateWindowStation(stationName, 0, 0x000F037F, IntPtr.Zero); Require(station != IntPtr.Zero);
            stage = "attach-private-station";
            Require(SetProcessWindowStation(station));
            stage = "create-private-desktop";
            desktop = CreateDesktop("Harness", IntPtr.Zero, IntPtr.Zero, 0, 0x000F01FF, IntPtr.Zero); Require(desktop != IntPtr.Zero);
            stage = "create-owned-job";
            job = CreateJobObject(IntPtr.Zero, null); Require(job != IntPtr.Zero);
            var limits = new JobLimits(); limits.Basic.Flags = 0x2000;
            Require(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(JobLimits))));
            var startup = new Startup { Size = (uint)Marshal.SizeOf(typeof(Startup)), Desktop = stationName + "\\Harness", Flags = 1, Show = 0 };
            var command = new StringBuilder(Quote(args[1]) + " " + Quote(args[2]) + " --isolated-worker " + Quote(root));
            Require(CreateProcess(args[1], command, IntPtr.Zero, IntPtr.Zero, false, 0x08000004, IntPtr.Zero, args[3], ref startup, out child));
            stage = "assign-suspended-worker";
            Require(AssignProcessToJobObject(job, child.Process)); assigned = true;
            stage = "resume-worker";
            Require(ResumeThread(child.Thread) != UInt32.MaxValue);
            stage = "wait-worker";
            var clock = Stopwatch.StartNew();
            while (WaitForSingleObject(child.Process, 20) == 0x102) {
                if (clock.Elapsed.TotalSeconds > 150) throw new TimeoutException("Isolated worker exceeded its bounded lifetime.");
            }
            Require(GetExitCodeProcess(child.Process, out exitCode));
        }
        catch (Exception error) { failure = stage + ": " + error.ToString(); exitCode = 1; }
        finally {
            if (job != IntPtr.Zero) CloseHandle(job);
            if (child.Process != IntPtr.Zero && !assigned) TerminateProcess(child.Process, 1);
            if (child.Process != IntPtr.Zero) { WaitForSingleObject(child.Process, 3000); CloseHandle(child.Process); }
            if (child.Thread != IntPtr.Zero) CloseHandle(child.Thread);
            if (desktop != IntPtr.Zero && GetThreadDesktop(GetCurrentThreadId()) != desktop) desktopClosed = CloseDesktop(desktop);
            // The disposable owner exits on this station. Windows then releases its station handle.
            // The outer process checks namespace removal after this owner exits.
            Write(Path.Combine(root, "isolation-receipt.json"), new { stationName, desktopName = "Harness", origin,
                workerPid = child.Pid, exitCode, failure, desktopClosed, stationReleasedAtOwnerExit = true,
                switchedInputDesktop = false, jobKillsDescendantsOnClose = true });
        }
        return (int)exitCode;
    }
}
