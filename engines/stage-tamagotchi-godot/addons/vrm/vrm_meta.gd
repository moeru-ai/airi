@tool
extends Resource

# VRM extension is for 3d humanoid avatars (and models) in VR applications.
# Meta schema:

# Title of VRM model
@export var title: String

# Version of VRM model
@export var version: String

# Thumbnail of VRM model
@export var thumbnail_image: Texture

@export_subgroup("Author and Reference")

# Author of VRM model
@export var authors: PackedStringArray
@export var author: String:
	get:
		return ",".join(authors)
	set(value):
		authors = PackedStringArray() if value.is_empty() else value.split(",")

# Contact Information of VRM model author
@export var contact_information: String

# Reference of VRM model
@export var references: PackedStringArray
@export var reference_information: String:
	get:
		return ",".join(references)
	set(value):
		references = PackedStringArray() if value.is_empty() else value.split(",")

@export_subgroup("Permission")

# A person who can perform with this avatar
@export_enum(" ", "OnlyAuthor", "ExplicitlyLicensedPerson", "Everyone") var allowed_user_name: String
# A flag that permits to use this model in excessively violent contents
@export_enum(" ", "Disallow", "Allow") var violent_usage: String
# A flag that permits to use this model in excessively sexual contents
@export_enum(" ", "Disallow", "Allow") var sexual_usage: String
# An option that permits to use this model in commercial products
@export_enum(" ", "PersonalNonProfit", "PersonalProfit", "AllowCorporation") var commercial_usage_type: String
# A flag that permits to use this model in political or religious contents
@export_enum(" ", "Disallow", "Allow") var political_religious_usage: String
# A flag that permits to use this model in contents contain anti-social activities or hate speeches
@export_enum(" ", "Disallow", "Allow") var antisocial_hate_usage: String
# An option that forces or abandons to display the credit of this model
@export_enum(" ", "Required", "Unnecessary") var credit_notation: String
# A flag that permits to redistribute this model
@export_enum(" ", "Disallow", "Allow") var allow_redistribution: String
# An option that controls the condition to modify this model
@export_enum(" ", "Prohibited", "AllowModification", "AllowModificationRedistribution") var modification: String
# If there are any conditions not mentioned above, put the URL link of the license document here.
@export var other_permission_url: String

# License type (VRM 0.0 only)
@export var license_name: String
# (String,"","Redistribution_Prohibited","CC0","CC_BY","CC_BY_NC","CC_BY_SA","CC_BY_NC_SA","CC_BY_ND","CC_BY_NC_ND","Other")
# License URL (VRM 1.0 only)
@export var license_url: String
# Third party licenses of the model, if required. You can use line breaks. VRM 1.0 only
@export var third_party_licenses: String
# If "Other" is selected, put the URL link of the license document here.
@export var other_license_url: String

@export_subgroup("Import Export data")

# Human bone name -> Reference node index
# NOTE: We are currently discarding all Unity-specific data.
# We may need to store it somewhere in case we wish to re-export.
@export var humanoid_bone_mapping: BoneMap  # VRM boneName -> bone name (within skeleton)

# NOTE: Mouth offset is not stored in any model metadata.
# As an alternative, we could get the centroid of vertices moved by viseme blend shapes.
# But for now, users should assume same as eyeOffset with y=0 (relative to head)

# Toplevel schema, belongs in vrm_meta:
# Version of exporter that vrm created. UniVRM-0.46
@export var exporter_version: String

# Version of VRM specification. 0.0
@export var spec_version: String
