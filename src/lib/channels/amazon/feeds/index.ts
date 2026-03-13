// Amazon Feeds Module
// All Amazon feed template generation and submission logic.
export { submitPendingUpdates, pollFeedStatus } from "./service";
export { generateCategoryTemplate, type TemplateProductRow } from "./generator";
export {
  getTemplateForCategory,
  getTemplatePath,
  CATEGORY_TEMPLATES,
  type CategoryTemplateEntry,
} from "./template-registry";
