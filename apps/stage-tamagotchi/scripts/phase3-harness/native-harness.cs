using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// This fixture owns its windows and business state. It has no input delivery API.
namespace Phase3Harness
{
    internal static class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        internal struct Rect { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)]
        internal struct Point { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)]
        internal struct GuiInfo { public uint Size, Flags; public IntPtr Active, Focus, Capture, Menu, Move, Caret; public Rect CaretRect; }
        internal delegate void EventCallback(IntPtr hook, uint kind, IntPtr hwnd, int obj, int child, uint thread, uint time);
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll")] internal static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
        [DllImport("user32.dll")] internal static extern bool ScreenToClient(IntPtr hwnd, ref Point point);
        [DllImport("user32.dll")] internal static extern IntPtr ChildWindowFromPointEx(IntPtr hwnd, Point point, uint flags);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);
        [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out Rect rect, int size);
        [DllImport("user32.dll")] internal static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, EventCallback callback, uint pid, uint thread, uint flags);
        [DllImport("user32.dll")] internal static extern bool UnhookWinEvent(IntPtr hook);
        [DllImport("user32.dll")] internal static extern IntPtr GetProcessWindowStation();
        [DllImport("user32.dll")] internal static extern IntPtr GetThreadDesktop(uint thread);
        [DllImport("kernel32.dll")] internal static extern uint GetCurrentThreadId();
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder text, uint size, out uint needed);
        [DllImport("user32.dll")] internal static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);

        internal static string ObjectName(IntPtr handle)
        {
            var text = new StringBuilder(256); uint needed;
            if (!GetUserObjectInformation(handle, 2, text, 512, out needed)) throw new InvalidOperationException("Cannot identify fixture desktop.");
            return text.ToString();
        }
        internal static string StationName { get { return ObjectName(GetProcessWindowStation()); } }
        internal static void RequireIsolated()
        {
            if (!StationName.StartsWith("airi-phase3b2a-", StringComparison.Ordinal) || ObjectName(GetThreadDesktop(GetCurrentThreadId())) != "Harness")
                throw new InvalidOperationException("Executor fault controls require the private test station.");
        }
        internal static object Focus()
        {
            var info = new GuiInfo { Size = (uint)Marshal.SizeOf(typeof(GuiInfo)) };
            bool read = GetGUIThreadInfo(GetCurrentThreadId(), ref info);
            return new { read, active = info.Active.ToInt64().ToString(), focus = info.Focus.ToInt64().ToString() };
        }

        internal static object Identity(IntPtr hwnd)
        {
            uint pid;
            uint thread = GetWindowThreadProcessId(hwnd, out pid);
            var name = new StringBuilder(256);
            GetClassName(hwnd, name, name.Capacity);
            Rect rect;
            GetWindowRect(hwnd, out rect);
            return new { hwnd = hwnd.ToInt64().ToString(), exists = IsWindow(hwnd), pid, thread, className = name.ToString(), rect = Rectangle(rect) };
        }

        internal static object Rectangle(Rect rect)
        {
            return new { x = rect.Left, y = rect.Top, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top };
        }
    }

    internal sealed class ObservedEditor : TextBox
    {
        internal int MouseMessages, KeyMessages, TextChanges;
        protected override void WndProc(ref Message message)
        {
            if (message.Msg >= 0x200 && message.Msg <= 0x20e) MouseMessages++;
            if (message.Msg >= 0x100 && message.Msg <= 0x109) KeyMessages++;
            base.WndProc(ref message);
        }
        protected override void OnTextChanged(EventArgs args) { TextChanges++; base.OnTextChanged(args); }
    }

    internal sealed class ObservedButton : Button
    {
        internal int MouseMessages, MouseDownMessages, MouseUpMessages, KeyMessages, ClickEvents;
        internal event Action Changed;
        internal event Action MessageObserved;

        protected override void WndProc(ref Message message)
        {
            bool mouse = message.Msg >= 0x200 && message.Msg <= 0x20e;
            bool observed = mouse || (message.Msg >= 0x100 && message.Msg <= 0x109);
            if (mouse) MouseMessages++;
            if (message.Msg == 0x201 || message.Msg == 0x204 || message.Msg == 0x207 || message.Msg == 0x20b) MouseDownMessages++;
            if (message.Msg == 0x202 || message.Msg == 0x205 || message.Msg == 0x208 || message.Msg == 0x20c) MouseUpMessages++;
            if (message.Msg >= 0x100 && message.Msg <= 0x109) KeyMessages++;
            base.WndProc(ref message);
            if (observed && MessageObserved != null) MessageObserved();
        }

        protected override void OnClick(EventArgs args)
        {
            ClickEvents++;
            base.OnClick(args);
            if (Changed != null) Changed();
        }

        internal object Counts()
        {
            return new { mouseMessages = MouseMessages, mouseDown = MouseDownMessages, mouseUp = MouseUpMessages, keys = KeyMessages, clickEvents = ClickEvents };
        }
    }

    internal sealed class TargetWindow : Form
    {
        internal ObservedButton Commit = new ObservedButton();
        internal readonly ObservedButton Decoy = new ObservedButton();
        internal readonly ObservedEditor Editor = new ObservedEditor();
        internal readonly List<ObservedButton> RetiredButtons = new List<ObservedButton>();
        internal int ChildGeneration = 1;
        internal readonly string WindowInstance = Guid.NewGuid().ToString("N");
        internal readonly string Nonce = Guid.NewGuid().ToString("N");
        internal string Result = "";
        internal int CommitCount, RootMouseMessages, RootKeyMessages;
        internal readonly int Generation;
        internal IntPtr RootHandle, CommitHandle, DecoyHandle;
        internal Native.Point ApprovedScreenPoint;
        private readonly Label resultLabel = new Label();

        internal TargetWindow(string label, int generation)
        {
            Generation = generation;
            Text = "AIRI isolated target " + label + " " + WindowInstance;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-12000, -12000);
            ClientSize = new Size(420, 250);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            ShowInTaskbar = false;
            MaximizeBox = false;
            MinimizeBox = false;
            AutoScaleMode = AutoScaleMode.None;
            var identity = new Label { Text = label + ": " + Nonce, Location = new Point(20, 16), Size = new Size(380, 30) };
            Commit.Text = "Commit once";
            Commit.Name = "commit";
            Commit.Location = new Point(24, 64);
            Commit.Size = new Size(150, 48);
            Decoy.Text = "Never authorized";
            Decoy.Name = "decoy";
            Decoy.Location = new Point(220, 64);
            Decoy.Size = new Size(150, 48);
            Editor.Name = "editor";
            Editor.Location = new Point(24, 126);
            Editor.Size = new Size(346, 25);
            resultLabel.Location = new Point(20, 163);
            resultLabel.Size = new Size(380, 80);
            BindCommit(label);
            Controls.AddRange(new Control[] { identity, Commit, Decoy, Editor, resultLabel });
        }

        private void BindCommit(string label)
        {
            Commit.Changed += delegate {
                if (CommitCount == 0)
                {
                    CommitCount = 1;
                    Result = label + ":" + WindowInstance + ":" + Nonce;
                    resultLabel.Text = Result;
                }
            };
        }

        internal void ReplaceCommit(string label)
        {
            Native.RequireIsolated();
            var old = Commit;
            var location = old.Location;
            Controls.Remove(old);
            old.Dispose();
            RetiredButtons.Add(old);
            Commit = new ObservedButton { Name = "commit", Text = "Commit once", Location = location, Size = new Size(150, 48) };
            BindCommit(label);
            Controls.Add(Commit);
            ChildGeneration++;
            ObserveHandles();
        }

        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams
        {
            get
            {
                var value = base.CreateParams;
                value.ExStyle |= 0x08000000 | 0x00000080; // WS_EX_NOACTIVATE and WS_EX_TOOLWINDOW.
                return value;
            }
        }

        internal void ObserveHandles()
        {
            RootHandle = Handle;
            CommitHandle = Commit.Handle;
            DecoyHandle = Decoy.Handle;
            var center = Commit.PointToScreen(new Point(Commit.Width / 2, Commit.Height / 2));
            ApprovedScreenPoint = new Native.Point { X = center.X, Y = center.Y };
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg >= 0x200 && message.Msg <= 0x20e) RootMouseMessages++;
            if (message.Msg >= 0x100 && message.Msg <= 0x109) RootKeyMessages++;
            base.WndProc(ref message);
        }

        internal object Snapshot()
        {
            bool live = !IsDisposed && Native.IsWindow(RootHandle);
            Native.Rect frame;
            if (Native.DwmGetWindowAttribute(RootHandle, 9, out frame, Marshal.SizeOf(typeof(Native.Rect))) != 0)
                Native.GetWindowRect(RootHandle, out frame);
            Native.Rect button;
            Native.GetWindowRect(CommitHandle, out button);
            var point = ApprovedScreenPoint;
            IntPtr hit = IntPtr.Zero;
            if (live && Native.ScreenToClient(RootHandle, ref point))
                hit = Native.ChildWindowFromPointEx(RootHandle, point, 7);
            return new {
                windowInstance = WindowInstance, nonce = Nonce, generation = Generation, live,
                childGeneration = ChildGeneration, gui = Native.Focus(),
                root = Native.Identity(RootHandle), button = Native.Identity(CommitHandle), decoy = Native.Identity(DecoyHandle),
                frame = Native.Rectangle(frame),
                buttonPoint = new { x = (button.Left + button.Right) / 2 - frame.Left, y = (button.Top + button.Bottom) / 2 - frame.Top },
                originalScreenPoint = new { x = ApprovedScreenPoint.X, y = ApprovedScreenPoint.Y },
                originalPointCurrentHit = hit.ToInt64().ToString(),
                business = new { result = Result, commitCount = CommitCount, button = Commit.Counts(), decoy = Decoy.Counts(), rootMouseMessages = RootMouseMessages, rootKeyMessages = RootKeyMessages,
                    editor = new { text = Editor.Text, textChanges = Editor.TextChanges, keys = Editor.KeyMessages, mouseMessages = Editor.MouseMessages },
                    retiredButtons = RetiredButtons.ConvertAll(item => item.Counts()) }
            };
        }
    }

    internal sealed class Harness : ApplicationContext
    {
        private readonly string directory, label, instance = Guid.NewGuid().ToString("N");
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private readonly List<TargetWindow> history = new List<TargetWindow>();
        private readonly List<object> foregroundEvents = new List<object>();
        private readonly Native.EventCallback foregroundCallback;
        private readonly IntPtr hook, initialForeground;
        private readonly DateTime started = DateTime.UtcNow;
        private TargetWindow window;
        private int sequence;
        private string command = "start";
        private bool stopped;
        private bool paused, pauseTimedOut;

        internal Harness(string output, string targetLabel)
        {
            directory = output;
            label = targetLabel;
            Directory.CreateDirectory(directory);
            initialForeground = Native.GetForegroundWindow();
            foregroundCallback = delegate(IntPtr handle, uint kind, IntPtr hwnd, int obj, int child, uint thread, uint time) {
                foregroundEvents.Add(new { hwnd = hwnd.ToInt64().ToString(), time, identity = Native.Identity(hwnd) });
            };
            hook = Native.SetWinEventHook(3, 3, IntPtr.Zero, foregroundCallback, 0, 0, 0);
            if (hook == IntPtr.Zero && !Native.StationName.StartsWith("airi-phase3b2a-", StringComparison.Ordinal))
                throw new InvalidOperationException("Foreground witness hook failed.");
            CreateWindow();
            timer.Interval = 40;
            timer.Tick += Tick;
            timer.Start();
            Write();
        }

        private void CreateWindow()
        {
            window = new TargetWindow(label, history.Count + 1);
            history.Add(window);
            window.Show();
            // A replacement must publish real handles before its command acknowledgement.
            window.ObserveHandles();
            window.Commit.Changed += Write;
            window.Commit.MessageObserved += Write;
            window.Decoy.Changed += Write;
            window.Decoy.MessageObserved += Write;
        }

        private void Tick(object sender, EventArgs args)
        {
            if ((DateTime.UtcNow - started).TotalSeconds > 180) { Stop(); return; }
            string path = Path.Combine(directory, "request.json");
            if (!File.Exists(path)) return;
            Dictionary<string, object> request;
            try { request = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(path)); }
            catch (IOException) { return; }
            int next = Convert.ToInt32(request["sequence"]);
            if (next <= sequence) return;
            sequence = next;
            command = Convert.ToString(request["command"]);
            switch (command)
            {
                case "snapshot": break;
                case "swap-controls":
                    window.Commit.Location = new Point(220, 64);
                    window.Decoy.Location = new Point(24, 64);
                    break;
                case "restore-controls":
                    window.Commit.Location = new Point(24, 64);
                    window.Decoy.Location = new Point(220, 64);
                    break;
                case "shrink": window.ClientSize = new Size(70, 50); break;
                case "restore-size": window.ClientSize = new Size(420, 250); break;
                case "move": window.Location = new Point(-11500, -11500); break;
                case "replace": window.Close(); CreateWindow(); break;
                case "close": window.Close(); break;
                case "focus-editor": Native.RequireIsolated(); window.Activate(); window.Editor.Focus(); break;
                case "replace-child": ReplaceChild(); break;
                case "pause": Pause(request); break;
                case "stop": Stop(); return;
                default: throw new InvalidOperationException("Unsupported fixture command: " + command);
            }
            Write();
        }

        private void ReplaceChild()
        {
            window.ReplaceCommit(label);
            window.Commit.Changed += Write;
            window.Commit.MessageObserved += Write;
        }

        private void Pause(Dictionary<string, object> request)
        {
            Native.RequireIsolated();
            string release = Path.Combine(directory, "pause-release");
            if (File.Exists(release)) File.Delete(release);
            paused = true;
            Write();
            var deadline = DateTime.UtcNow.AddSeconds(20);
            while (!File.Exists(release) && DateTime.UtcNow < deadline) Thread.Sleep(5);
            pauseTimedOut = !File.Exists(release);
            paused = false;
            if (pauseTimedOut) throw new TimeoutException("Receiver barrier timed out. No input retry is allowed.");
            string after = request.ContainsKey("afterPause") ? Convert.ToString(request["afterPause"]) : "none";
            if (after == "close") window.Close();
            else if (after == "replace-child") ReplaceChild();
            else if (after != "none") throw new InvalidOperationException("Unsupported pause action.");
        }

        private void Write()
        {
            var process = Process.GetCurrentProcess();
            var states = new List<object>();
            foreach (var item in history) states.Add(item.Snapshot());
            var record = new {
                schema = 1, mode = "real-win32-fixture", label, instance, sequence, command, stopped, paused, pauseTimedOut,
                station = Native.StationName, desktop = Native.ObjectName(Native.GetThreadDesktop(Native.GetCurrentThreadId())),
                timestamp = DateTime.UtcNow.ToString("o"), pid = process.Id,
                processStartedUtc = process.StartTime.ToUniversalTime().ToString("o"), executable = process.MainModule.FileName,
                initialForeground = initialForeground.ToInt64().ToString(), foreground = Native.GetForegroundWindow().ToInt64().ToString(),
                foregroundHookActive = hook != IntPtr.Zero && !stopped, foregroundEvents, windows = states
            };
            string contents = json.Serialize(record);
            File.AppendAllText(Path.Combine(directory, "oracle.jsonl"), contents + Environment.NewLine);
            string destination = Path.Combine(directory, "state.json");
            string temporary = destination + ".tmp";
            File.WriteAllText(temporary, contents);
            if (File.Exists(destination)) File.Replace(temporary, destination, null);
            else File.Move(temporary, destination);
        }

        private void Stop()
        {
            stopped = true;
            timer.Stop();
            foreach (var item in history) if (!item.IsDisposed) item.Close();
            Write();
            Native.UnhookWinEvent(hook);
            timer.Dispose();
            ExitThread();
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Length != 2) return;
            try
            {
                Application.EnableVisualStyles();
                Application.Run(new Harness(args[0], args[1]));
            }
            catch (Exception error)
            {
                Directory.CreateDirectory(args[0]);
                File.WriteAllText(Path.Combine(args[0], "error.txt"), error.ToString());
                Environment.ExitCode = 1;
            }
        }
    }
}
