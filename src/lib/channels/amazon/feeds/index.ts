// Amazon Feeds Module — all template generation and SP-API submission logic.
export { submitPendingUpdates, pollFeedStatus, deleteAmazonFeedRecordForUser } from "./service";
export { generateCategoryTemplate, type TemplateProductRow } from "./generator";
export {
  getTemplateForProductType,
  type CategoryTemplateEntry,
} from "./template-registry";
