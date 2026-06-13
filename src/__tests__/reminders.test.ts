import { describe, it, expect } from "vitest";
import { parseReminderCommand } from "@/lib/reminders";

describe("parseReminderCommand", () => {
  it("parses 'remind me in 10 minutes to stretch'", () => {
    const before = Date.now();
    const result = parseReminderCommand("remind me in 10 minutes to stretch");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("stretch");
    expect(result!.dueAt).toBeGreaterThanOrEqual(before + 10 * 60000 - 100);
    expect(result!.dueAt).toBeLessThanOrEqual(before + 10 * 60000 + 100);
    expect(result!.recurrence).toBeNull();
  });

  it("parses 'remind me in 1 hour to check email'", () => {
    const before = Date.now();
    const result = parseReminderCommand("remind me in 1 hour to check email");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("check email");
    expect(result!.dueAt).toBeGreaterThanOrEqual(before + 3600000 - 100);
    expect(result!.dueAt).toBeLessThanOrEqual(before + 3600000 + 100);
    expect(result!.recurrence).toBeNull();
  });

  it("parses 'remind me every morning to take a break'", () => {
    const result = parseReminderCommand("remind me every morning to take a break");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("take a break");
    expect(result!.recurrence).toBe("daily");
    // Should be at 9am
    const d = new Date(result!.dueAt);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it("parses 'remind me every day to water plants'", () => {
    const before = Date.now();
    const result = parseReminderCommand("remind me every day to water plants");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("water plants");
    expect(result!.recurrence).toBe("daily");
    expect(result!.dueAt).toBeGreaterThanOrEqual(before + 86400000 - 100);
    expect(result!.dueAt).toBeLessThanOrEqual(before + 86400000 + 100);
  });

  it("parses 'remind me to drink water' (no time, defaults to 1hr)", () => {
    const before = Date.now();
    const result = parseReminderCommand("remind me to drink water");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("drink water");
    expect(result!.dueAt).toBeGreaterThanOrEqual(before + 3600000 - 100);
    expect(result!.dueAt).toBeLessThanOrEqual(before + 3600000 + 100);
    expect(result!.recurrence).toBeNull();
  });

  it("returns null for 'open Chrome'", () => {
    expect(parseReminderCommand("open Chrome")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseReminderCommand("")).toBeNull();
  });

  it("parses 'remind me tomorrow at 10:30 to call mom'", () => {
    const result = parseReminderCommand("remind me tomorrow at 10:30 to call mom");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("call mom");
    expect(result!.recurrence).toBeNull();
    // Should be tomorrow
    const d = new Date(result!.dueAt);
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    expect(d.getFullYear()).toBe(tomorrow.getFullYear());
    expect(d.getMonth()).toBe(tomorrow.getMonth());
    expect(d.getDate()).toBe(tomorrow.getDate());
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(30);
  });

  it("parses 'remind me at 14:00 to have lunch'", () => {
    const result = parseReminderCommand("remind me at 14:00 to have lunch");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("have lunch");
    expect(result!.recurrence).toBeNull();
    const d = new Date(result!.dueAt);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(0);
  });

  it("parses 'remind me every week to clean desk'", () => {
    const before = Date.now();
    const result = parseReminderCommand("remind me every week to clean desk");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("clean desk");
    expect(result!.recurrence).toBe("weekly");
    expect(result!.dueAt).toBeGreaterThanOrEqual(before + 604800000 - 100);
    expect(result!.dueAt).toBeLessThanOrEqual(before + 604800000 + 100);
  });

  it("parses 'remind me after 5 mins to check phone'", () => {
    const before = Date.now();
    const result = parseReminderCommand("remind me after 5 mins to check phone");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("check phone");
    expect(result!.dueAt).toBeGreaterThanOrEqual(before + 5 * 60000 - 100);
    expect(result!.dueAt).toBeLessThanOrEqual(before + 5 * 60000 + 100);
  });

  it("parses 'remind me each morning to meditate'", () => {
    const result = parseReminderCommand("remind me each morning to meditate");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("meditate");
    expect(result!.recurrence).toBe("daily");
    const d = new Date(result!.dueAt);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });
});
