export const domainConfigs: Record<
  string,
  { selector: string; remove?: string[] }
> = {
  "example.com": {
    selector: "main",
    remove: ["nav", "footer", ".ads-container"],
  },
};
