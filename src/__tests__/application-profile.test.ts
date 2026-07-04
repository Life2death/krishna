import { describe, it, expect } from "vitest";
import { defaultProfile, findMissingFields } from "@/types";

describe("ApplicationProfile — defaultProfile", () => {
  it("returns all fields empty", () => {
    const p = defaultProfile();
    expect(p.fullName).toBe("");
    expect(p.email).toBe("");
    expect(p.phone).toBe("");
    expect(p.relocationOk).toBe(false);
  });
});

describe("ApplicationProfile — findMissingFields", () => {
  it("reports all string fields as missing on empty profile", () => {
    const missing = findMissingFields(defaultProfile());
    expect(missing).toContain("Full name");
    expect(missing).toContain("Email");
    expect(missing).toContain("Phone");
    expect(missing).toContain("Current location");
    expect(missing).toContain("Notice period");
    expect(missing).toContain("Current CTC");
    expect(missing).toContain("Expected CTC");
    expect(missing).toContain("Years of experience");
    expect(missing).toContain("Resume path");
    expect(missing).toContain("LinkedIn URL");
    expect(missing).toContain("Why this role");
    expect(missing).not.toContain("Relocation ok");
  });

  it("reports no missing when all fields are filled", () => {
    const missing = findMissingFields({
      fullName: "Vikram Rao",
      email: "vikram@example.com",
      phone: "+91-9876543210",
      currentLocation: "Bangalore",
      noticePeriod: "30 days",
      currentCtc: "12L",
      expectedCtc: "18L",
      yearsOfExperience: "8",
      resumePath: "C:\\resume.pdf",
      linkedInUrl: "https://linkedin.com/in/vikram",
      whyThisRole: "Excited about the role",
      relocationOk: true,
    });
    expect(missing).toHaveLength(0);
  });

  it("reports only empty fields", () => {
    const missing = findMissingFields({
      fullName: "Vikram Rao",
      email: "",
      phone: "+91-9876543210",
      currentLocation: "Bangalore",
      noticePeriod: "",
      currentCtc: "12L",
      expectedCtc: "18L",
      yearsOfExperience: "8",
      resumePath: "C:\\resume.pdf",
      linkedInUrl: "",
      whyThisRole: "Excited about the role",
      relocationOk: false,
    });
    expect(missing).toEqual(["Email", "Notice period", "LinkedIn URL"]);
  });
});
