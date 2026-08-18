param(
    [Parameter(Mandatory = $true)]
    [int] $TargetProcessId,

    [Parameter(Mandatory = $true)]
    [string] $OutputPath,

    [int] $TimeoutMs = 15000,

    [int] $SettleMs = 1000
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WindowCaptureNative
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out Rect lpRect);

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr hWnd, ref Point lpPoint);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        uint uFlags
    );

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Point
    {
        public int X;
        public int Y;
    }

    public struct WindowInfo
    {
        public IntPtr Handle;
        public int X;
        public int Y;
        public int Width;
        public int Height;
        public string Title;
    }

    public static WindowInfo FindBestWindow(int processId)
    {
        WindowInfo best = new WindowInfo();

        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam)
        {
            uint windowProcessId;
            GetWindowThreadProcessId(hWnd, out windowProcessId);
            if (windowProcessId != processId || !IsWindowVisible(hWnd))
            {
                return true;
            }

            WindowInfo candidate = GetWindowInfo(hWnd);
            long bestArea = (long)best.Width * best.Height;
            long candidateArea = (long)candidate.Width * candidate.Height;
            if (candidateArea > bestArea)
            {
                best = candidate;
            }

            return true;
        }, IntPtr.Zero);

        return best;
    }

    public static WindowInfo GetWindowInfo(IntPtr hWnd)
    {
        Rect rect;
        if (!GetClientRect(hWnd, out rect))
        {
            return new WindowInfo();
        }

        Point point = new Point();
        if (!ClientToScreen(hWnd, ref point))
        {
            return new WindowInfo();
        }

        return new WindowInfo
        {
            Handle = hWnd,
            X = point.X,
            Y = point.Y,
            Width = rect.Right - rect.Left,
            Height = rect.Bottom - rect.Top,
            Title = GetTitle(hWnd),
        };
    }

    private static string GetTitle(IntPtr hWnd)
    {
        int length = GetWindowTextLength(hWnd);
        if (length <= 0)
        {
            return "";
        }

        StringBuilder builder = new StringBuilder(length + 1);
        GetWindowText(hWnd, builder, builder.Capacity);
        return builder.ToString();
    }
}
"@

try {
    [WindowCaptureNative]::SetProcessDPIAware() | Out-Null
}
catch {
    # The PowerShell host may already have a DPI awareness context.
}

$deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
$window = [WindowCaptureNative]::FindBestWindow($TargetProcessId)
while ($window.Handle -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $window = [WindowCaptureNative]::FindBestWindow($TargetProcessId)
}

if ($window.Handle -eq [IntPtr]::Zero) {
    throw "Could not find a visible top-level window for process $TargetProcessId."
}

[WindowCaptureNative]::ShowWindow($window.Handle, 9) | Out-Null
[WindowCaptureNative]::SetWindowPos(
    $window.Handle,
    [IntPtr]::new(-1),
    0,
    0,
    0,
    0,
    0x0001 -bor 0x0002 -bor 0x0040
) | Out-Null
[WindowCaptureNative]::SetForegroundWindow($window.Handle) | Out-Null
Start-Sleep -Milliseconds $SettleMs
$window = [WindowCaptureNative]::GetWindowInfo($window.Handle)

if ($window.Width -le 0 -or $window.Height -le 0) {
    throw "Godot window client area is empty."
}

$directory = [System.IO.Path]::GetDirectoryName($OutputPath)
if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$bitmap = [System.Drawing.Bitmap]::new(
    $window.Width,
    $window.Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
    $graphics.CopyFromScreen(
        $window.X,
        $window.Y,
        0,
        0,
        [System.Drawing.Size]::new($window.Width, $window.Height),
        [System.Drawing.CopyPixelOperation]::SourceCopy
    )
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    [WindowCaptureNative]::SetWindowPos(
        $window.Handle,
        [IntPtr]::new(-2),
        0,
        0,
        0,
        0,
        0x0001 -bor 0x0002
    ) | Out-Null
}

$resolvedPath = (Resolve-Path -LiteralPath $OutputPath).Path
@{
    height = $window.Height
    left = $window.X
    path = $resolvedPath
    title = $window.Title
    top = $window.Y
    width = $window.Width
} | ConvertTo-Json -Compress
