extends RefCounted

const vrm_to_human_bone: Dictionary = {
	"hips": "Hips",
	"spine": "Spine",
	"chest": "Chest",
	"upperChest": "UpperChest",
	"neck": "Neck",
	"head": "Head",
	"leftEye": "LeftEye",
	"rightEye": "RightEye",
	"jaw": "Jaw",
	"leftShoulder": "LeftShoulder",
	"leftUpperArm": "LeftUpperArm",
	"leftLowerArm": "LeftLowerArm",
	"leftHand": "LeftHand",
	"leftThumbMetacarpal": "LeftThumbMetacarpal",
	"leftThumbProximal": "LeftThumbProximal",
	"leftThumbDistal": "LeftThumbDistal",
	"leftIndexProximal": "LeftIndexProximal",
	"leftIndexIntermediate": "LeftIndexIntermediate",
	"leftIndexDistal": "LeftIndexDistal",
	"leftMiddleProximal": "LeftMiddleProximal",
	"leftMiddleIntermediate": "LeftMiddleIntermediate",
	"leftMiddleDistal": "LeftMiddleDistal",
	"leftRingProximal": "LeftRingProximal",
	"leftRingIntermediate": "LeftRingIntermediate",
	"leftRingDistal": "LeftRingDistal",
	"leftLittleProximal": "LeftLittleProximal",
	"leftLittleIntermediate": "LeftLittleIntermediate",
	"leftLittleDistal": "LeftLittleDistal",
	"rightShoulder": "RightShoulder",
	"rightUpperArm": "RightUpperArm",
	"rightLowerArm": "RightLowerArm",
	"rightHand": "RightHand",
	"rightThumbMetacarpal": "RightThumbMetacarpal",
	"rightThumbProximal": "RightThumbProximal",
	"rightThumbDistal": "RightThumbDistal",
	"rightIndexProximal": "RightIndexProximal",
	"rightIndexIntermediate": "RightIndexIntermediate",
	"rightIndexDistal": "RightIndexDistal",
	"rightMiddleProximal": "RightMiddleProximal",
	"rightMiddleIntermediate": "RightMiddleIntermediate",
	"rightMiddleDistal": "RightMiddleDistal",
	"rightRingProximal": "RightRingProximal",
	"rightRingIntermediate": "RightRingIntermediate",
	"rightRingDistal": "RightRingDistal",
	"rightLittleProximal": "RightLittleProximal",
	"rightLittleIntermediate": "RightLittleIntermediate",
	"rightLittleDistal": "RightLittleDistal",
	"leftUpperLeg": "LeftUpperLeg",
	"leftLowerLeg": "LeftLowerLeg",
	"leftFoot": "LeftFoot",
	"leftToes": "LeftToes",
	"rightUpperLeg": "RightUpperLeg",
	"rightLowerLeg": "RightLowerLeg",
	"rightFoot": "RightFoot",
	"rightToes": "RightToes",
}


static func get_vrm_to_human_bone(is_vrm_0) -> Dictionary:
	if is_vrm_0:
		var vrm0_to_human_bone = vrm_to_human_bone.duplicate()
		vrm0_to_human_bone["leftThumbIntermediate"] = "LeftThumbProximal"
		vrm0_to_human_bone["leftThumbProximal"] = "LeftThumbMetacarpal"
		vrm0_to_human_bone["rightThumbIntermediate"] = "RightThumbProximal"
		vrm0_to_human_bone["rightThumbProximal"] = "RightThumbMetacarpal"
		return vrm0_to_human_bone
	return vrm_to_human_bone

enum HeadHidingSetting {
	ThirdPersonOnly = 0,
	FirstPersonOnly = 1,
	FirstPersonOnlyWithShadow = 2,
	BothLayers = 3,
	BothLayersWithShadow = 4,
	IgnoreHeadHiding = 5,
}
