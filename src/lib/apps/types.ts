export type AppCategory = "logistics" | "payment" | "sms" | "email";

export interface AppConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  required: boolean;
}

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  category: AppCategory;
  icon: string;
  configFields: AppConfigField[];
}

export type AppStatus = "not_installed" | "installed" | "configured";

export interface AppWithStatus extends AppDefinition {
  status: AppStatus;
  installationId?: number;
  /** Non-sensitive config values. Sensitive (password) fields are redacted. */
  config?: Record<string, string>;
}
