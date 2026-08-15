import * as THREE from 'three';
import { FBXLoader } from 'three-stdlib';

export const mixamoVRMRigMap = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
  mixamorigLeftHandThumb1: 'leftThumbProximal',
  mixamorigLeftHandThumb2: 'leftThumbIntermediate',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightHandThumb1: 'rightThumbProximal',
  mixamorigRightHandThumb2: 'rightThumbIntermediate',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
};

export function loadMixamoAnimation(url, vrm) {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(
      url,
      (asset) => {
        if (!asset.animations || asset.animations.length === 0) {
          return reject('No animations found in FBX');
        }
        // Ambil animasi pertama
        const clip = asset.animations[0];
        resolve(retargetMixamoClip(clip, vrm));
      },
      undefined,
      reject
    );
  });
}

function retargetMixamoClip(clip, vrm) {
  const tracks = [];
  
  clip.tracks.forEach((track) => {
    const trackSplitted = track.name.split('.');
    const mixamoRigName = trackSplitted[0];
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);

    if (vrmNode) {
      const propertyName = trackSplitted[1];

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        // VRM uses normalized T-pose which typically matches Mixamo's T-pose directly
        tracks.push(new THREE.QuaternionKeyframeTrack(
          `${vrmNode.name}.${propertyName}`,
          track.times,
          track.values
        ));
      } else if (track instanceof THREE.VectorKeyframeTrack && mixamoRigName === 'mixamorigHips') {
        // Skala posisi turun karena FBX Mixamo biasanya dalam Centimeter, sedangkan VRM dalam Meter
        const values = track.values.map(v => v * 0.01);
        tracks.push(new THREE.VectorKeyframeTrack(
          `${vrmNode.name}.${propertyName}`,
          track.times,
          values
        ));
      }
    }
  });

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
