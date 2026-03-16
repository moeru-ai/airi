interface ToolInputSchema {
    required: string[];
    title: string;
    type: 'object';
    properties: Record<string, {
        title: string;
        type: string;
        default?: any;
    }>;
}
interface CallToolResult {
    content: {
        type: string;
        text: string;
    }[];
    isError: boolean;
}
interface Tool {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
}
declare function connectServer(command: string, args: string[]): Promise<void>;
declare function disconnectServer(): Promise<void>;
declare function listTools(): Promise<Tool[]>;
declare function callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;

export { callTool, connectServer, disconnectServer, listTools };
export type { CallToolResult, Tool, ToolInputSchema };
