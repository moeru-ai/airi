package com.getcapacitor;

public final class Logger {
    public static String tags(String value) { return value; }
    public static void debug(String value) {}
    public static void debug(String tag, String value) {}
    public static void warn(String tag, String value) {}
    public static void warn(String value) {}
    public static void error(String value) {}
    public static void error(String value, Throwable error) {}
    public static void error(String tag, String value, Throwable error) {}
    public static void info(String tag, String value) {}
}
