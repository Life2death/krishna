export interface ApplicationProfile {
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  noticePeriod: string;
  currentCtc: string;
  expectedCtc: string;
  yearsOfExperience: string;
  resumePath: string;
  linkedInUrl: string;
  whyThisRole: string;
  relocationOk: boolean;
}

export const PROFILE_STORAGE_KEY = "application_profile";

export function defaultProfile(): ApplicationProfile {
  return {
    fullName: "",
    email: "",
    phone: "",
    currentLocation: "",
    noticePeriod: "",
    currentCtc: "",
    expectedCtc: "",
    yearsOfExperience: "",
    resumePath: "",
    linkedInUrl: "",
    whyThisRole: "",
    relocationOk: false,
  };
}

export function findMissingFields(profile: ApplicationProfile): string[] {
  const labels: Record<keyof ApplicationProfile, string> = {
    fullName: "Full name",
    email: "Email",
    phone: "Phone",
    currentLocation: "Current location",
    noticePeriod: "Notice period",
    currentCtc: "Current CTC",
    expectedCtc: "Expected CTC",
    yearsOfExperience: "Years of experience",
    resumePath: "Resume path",
    linkedInUrl: "LinkedIn URL",
    whyThisRole: "Why this role",
    relocationOk: "Relocation ok",
  };
  const missing: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (key === "relocationOk") continue;
    const val = profile[key as keyof ApplicationProfile];
    if (typeof val === "string" && val.trim() === "") {
      missing.push(label);
    }
  }
  return missing;
}
