#!/usr/bin/env python3
"""Fix orchestrator test: replace 'const mockStream = vi.fn(); mockedStore(useLLM).stream = mockStream; mockedStore(useLLM).stream.mockImplementation'
with 'const mockStream = mockedStore(useLLM).stream as unknown as Mock; mockStream.mockImplementation'"""
import re

filepath = '/home/vi/animaios/packages/stage-ui/src/stores/character/orchestrator/index.test.ts'
with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Fix: "const mockStream = vi.fn()\n    mockedStore(useLLM).stream = mockStream\n    mockedStore(useLLM).stream.mockImplementation("
# -> "const mockStream = mockedStore(useLLM).stream as unknown as Mock\n    mockStream.mockImplementation("
content = re.sub(
    r'const mockStream = vi\.fn\(\)\n(\s+)mockedStore\(useLLM\)\.stream = mockStream\n(\s+)mockedStore\(useLLM\)\.stream\.mockImplementation\(',
    r'const mockStream = mockedStore(useLLM).stream as unknown as Mock\n\2mockStream.mockImplementation(',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed orchestrator test")
