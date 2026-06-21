import { describe, it, expect } from "vitest";
import { classifyAction } from "@krishna/core";
import { isUndoCommand } from "@/lib/perception";

describe("classifyAction", () => {
  it('classifies "open" as safe', () => {
    expect(classifyAction("open")).toBe("safe");
  });

  it('classifies "look" as safe', () => {
    expect(classifyAction("look")).toBe("safe");
  });

  it('classifies "youtube_search" as safe', () => {
    expect(classifyAction("youtube_search")).toBe("safe");
  });

  it('classifies "web_search" as safe', () => {
    expect(classifyAction("web_search")).toBe("safe");
  });

  it('classifies "delete_file" as sensitive', () => {
    expect(classifyAction("delete_file")).toBe("sensitive");
  });

  it('classifies "unknown_tool" as sensitive', () => {
    expect(classifyAction("unknown_tool")).toBe("sensitive");
  });

  // MCP tool classification (all-segment matching)
  it('classifies "mcp_search_issues" as safe', () => {
    expect(classifyAction("mcp_search_issues")).toBe("safe");
  });

  it('classifies "mcp_github_get_repo" as safe (get in any segment)', () => {
    expect(classifyAction("mcp_github_get_repo")).toBe("safe");
  });

  it('classifies "mcp_list_files" as safe', () => {
    expect(classifyAction("mcp_list_files")).toBe("safe");
  });

  it('classifies "mcp_delete_repo" as sensitive', () => {
    expect(classifyAction("mcp_delete_repo")).toBe("sensitive");
  });

  it('classifies "mcp_send_email" as sensitive', () => {
    expect(classifyAction("mcp_send_email")).toBe("sensitive");
  });

  it('classifies "mcp_exec_shell" as sensitive', () => {
    expect(classifyAction("mcp_exec_shell")).toBe("sensitive");
  });

  it('classifies "mcp_get_and_delete_repo" as sensitive (destructive wins over safe)', () => {
    expect(classifyAction("mcp_get_and_delete_repo")).toBe("sensitive");
  });

  it('classifies "mcp_create_and_list" as sensitive (create is destructive)', () => {
    expect(classifyAction("mcp_create_and_list")).toBe("sensitive");
  });

  it('classifies "mcp_frobnicate_thing" as sensitive (unknown verb)', () => {
    expect(classifyAction("mcp_frobnicate_thing")).toBe("sensitive");
  });
});

describe("isUndoCommand", () => {
  it('detects "undo that"', () => {
    expect(isUndoCommand("undo that")).toBe(true);
  });

  it('detects "undo it"', () => {
    expect(isUndoCommand("undo it")).toBe(true);
  });

  it('detects "undo the last thing"', () => {
    expect(isUndoCommand("undo the last thing")).toBe(true);
  });

  it("rejects 'open Chrome'", () => {
    expect(isUndoCommand("open Chrome")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isUndoCommand("")).toBe(false);
  });
});
