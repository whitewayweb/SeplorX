// Amazon Feeds Module — all template generation and SP-API submission logic.
export { submitPendingUpdates, pollFeedStatus, deleteAmazonFeedRecord } from "./service";
export { generateCategoryTemplate, type TemplateProductRow } from "./generator";
export {
  getTemplateForProductType,
  getAllTemplates,
  type CategoryTemplateEntry,
} from "./template-registry";
