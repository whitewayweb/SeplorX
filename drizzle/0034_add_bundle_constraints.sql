ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_not_self_referential" CHECK ("bundle_product_id" <> "component_product_id");
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_quantity_positive" CHECK ("quantity" > 0);
