using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Automation;

// Independent capability probe. These operations are not AUV implementation paths.
internal static class UiaProbe
{
    [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder text, uint size, out uint needed);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

    static string Station()
    {
        var value = new StringBuilder(256); uint needed;
        if (!GetUserObjectInformation(GetProcessWindowStation(), 2, value, 512, out needed)) throw new InvalidOperationException("Cannot identify UIA probe station.");
        return value.ToString();
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length < 4) return 2;
        string output = args[0], operation = args[1], station = Station();
        var elements = new List<object>(); string error = null; bool completed = false;
        try
        {
            var hwnd = new IntPtr(Int64.Parse(args[2])); uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid == 0 || pid != UInt32.Parse(args[3])) throw new InvalidOperationException("UIA probe target owner differs from the fixture process.");
            if (operation != "read" && !station.StartsWith("airi-phase3b2a-", StringComparison.Ordinal))
                throw new InvalidOperationException("UIA writes require the noninteractive test station.");
            var root = AutomationElement.FromHandle(hwnd);
            if (root.Current.ProcessId != pid) throw new InvalidOperationException("UIA root owner differs from the native owner.");
            var children = root.FindAll(TreeScope.Descendants, Condition.TrueCondition);
            if (children.Count > 32) throw new InvalidOperationException("Unexpected fixture accessibility tree size.");
            for (int index = 0; index < children.Count; index++)
            {
                var element = children[index];
                object invoke, value;
                bool canInvoke = element.TryGetCurrentPattern(InvokePattern.Pattern, out invoke);
                bool canSetValue = element.TryGetCurrentPattern(ValuePattern.Pattern, out value);
                elements.Add(new {
                    automationId = element.Current.AutomationId, runtimeId = element.GetRuntimeId(),
                    name = element.Current.Name, pid = element.Current.ProcessId, hwnd = element.Current.NativeWindowHandle,
                    controlType = element.Current.ControlType.ProgrammaticName, canInvoke, canSetValue
                });
            }
            if (operation == "read") completed = true;
            else
            {
                string id = operation == "invoke" ? "commit" : "editor";
                var element = root.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.AutomationIdProperty, id));
                if (element == null) throw new InvalidOperationException("Requested semantic fixture control is absent.");
                object pattern;
                if (operation == "invoke" && element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
                    ((InvokePattern)pattern).Invoke();
                else if (operation == "value" && args.Length == 5 && element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
                    ((ValuePattern)pattern).SetValue(args[4]);
                else throw new InvalidOperationException("The fixture does not expose the requested writable UIA pattern.");
                completed = true;
            }
        }
        catch (Exception failure) { error = failure.ToString(); }
        File.WriteAllText(output, new JavaScriptSerializer().Serialize(new {
            station, probePid = Process.GetCurrentProcess().Id, operation, completed, elements, error,
            executor = "independent UIAutomation client, not AUV"
        }));
        return completed ? 0 : 1;
    }
}
