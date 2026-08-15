import React, { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three-stdlib';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { retargetAnimation } from 'vrm-mixamo-retarget';

const FBX_FILES = [
  'Bashful.fbx', 'Blow A Kiss.fbx', 'Crying.fbx', 
  'Dwarf Idle (1).fbx', 'Dwarf Idle.fbx', 'Happy Hand Gesture.fbx', 
  'Look Around.fbx', 'Standing Arguing.fbx', 
  'Talking (1).fbx', 'Talking (2).fbx', 'Talking.fbx',
  'Sitting.fbx', 'Sitting (1).fbx'
];

const IDLE_POOL = ['Look Around', 'Dwarf Idle', 'Dwarf Idle (1)'];
const TALK_POOL = ['Talking', 'Talking (1)', 'Talking (2)', 'Standing Arguing', 'Happy Hand Gesture'];

export function Avatar({ url, isSpeaking, action, expression, onBodyClick, isSitting }) {
  const [vrm, setVrm] = useState(null);
  const [mixer, setMixer] = useState(null);
  const [clips, setClips] = useState({});
  const [randomIdleAction, setRandomIdleAction] = useState('Look Around');
  const [randomTalkAction, setRandomTalkAction] = useState('Talking');
  const currentActionRef = useRef(null);

  // ── IDLE & TALK BEHAVIOR ENGINE ──
  // Secara konstan mengganti gaya (bahkan saat diam atau ngobrol)
  useEffect(() => {
    let timeoutId;
    
    const changeAnimation = () => {
      if (isSpeaking) {
        // Saat ngobrol: ganti-ganti gaya tangan/bicara
        const nextTalk = TALK_POOL[Math.floor(Math.random() * TALK_POOL.length)];
        setRandomTalkAction(nextTalk);
        timeoutId = setTimeout(changeAnimation, Math.random() * 3000 + 3000); // Tiap 3-6 detik
      } else if (!action) {
        // Saat diam: ganti-ganti pose berdiri/nengok
        // Kadang-kadang beri elemen kejutan (mengeluh/mengantuk)
        const pool = Math.random() < 0.15 ? [...IDLE_POOL, 'Bashful'] : IDLE_POOL;
        const nextIdle = pool[Math.floor(Math.random() * pool.length)];
        setRandomIdleAction(nextIdle);
        timeoutId = setTimeout(changeAnimation, Math.random() * 5000 + 4000); // Tiap 4-9 detik
      }
    };

    timeoutId = setTimeout(changeAnimation, 1000);
    return () => clearTimeout(timeoutId);
  }, [isSpeaking, action]);

  useEffect(() => {
    let currentVrm = null;
    let currentMixer = null;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    
    loader.load(
      url,
      async (gltf) => {
        const vrmInstance = gltf.userData.vrm;
        if (vrmInstance) {
          VRMUtils.removeUnnecessaryJoints(gltf.scene);
          vrmInstance.scene.rotation.y = Math.PI;
          currentVrm = vrmInstance;
          setVrm(vrmInstance);
          
          currentMixer = new THREE.AnimationMixer(vrmInstance.scene);
          setMixer(currentMixer);

          const loadFbx = async (fileName) => {
            try {
              const fbxLoader = new FBXLoader();
              const fbx = await fbxLoader.loadAsync('/' + fileName);
              if (fbx.animations.length === 0) return null;
              
              const clipName = fbx.animations[0].name;
              const clip = retargetAnimation(fbx, vrmInstance, { animationClipName: clipName });
              return { name: fileName.replace('.fbx', ''), clip };
            } catch (e) {
              console.warn("Failed to load/retarget " + fileName, e);
              return null;
            }
          };

          // Muat semua file FBX sekaligus secara massal
          const results = await Promise.all(FBX_FILES.map(file => loadFbx(file)));
          
          const newClips = {};
          results.forEach(res => {
            if (res && res.clip) {
              const act = currentMixer.clipAction(res.clip);
              act.play();
              act.weight = 0; 
              newClips[res.name] = act;
            }
          });

          // Set animasi default
          if (newClips['Look Around']) {
            newClips['Look Around'].weight = 1;
            currentActionRef.current = newClips['Look Around'];
          }
          setClips(newClips);
        }
      },
      undefined,
      (error) => console.error(error)
    );
    return () => {
      if (currentMixer) currentMixer.stopAllAction();
      if (currentVrm) {
        currentVrm.scene.parent?.remove(currentVrm.scene);
        VRMUtils.deepDispose(currentVrm.scene);
      }
    };
  }, [url]);

  useEffect(() => {
    // Jika belum ada animasi apapun yang dimuat, return
    if (Object.keys(clips).length === 0) return; 
    
    // Prioritas Animasi:
    let targetName = 'Look Around';
    
    if (action) {
      if (action === 'hug') targetName = 'Bashful';
      else if (action === 'wave') targetName = 'Blow A Kiss';
      else if (action === 'dance') targetName = 'Happy Hand Gesture';
      else if (action === 'jump') targetName = 'Crying';
      else if (action === 'bow') targetName = 'Dwarf Idle';
    } else if (isSpeaking) {
      targetName = randomTalkAction;
    } else {
      targetName = randomIdleAction;
    }

    // Pastikan clip-nya benar-benar ada (berhasil diload)
    if (!clips[targetName]) {
       targetName = Object.keys(clips)[0]; // Fallback ke animasi apapun yang ada
    }

    const targetAction = clips[targetName];
    const prevAction = currentActionRef.current;
    
    if (targetAction && prevAction && targetAction !== prevAction) {
      targetAction.reset();
      targetAction.setEffectiveTimeScale(1);
      targetAction.setEffectiveWeight(1);
      targetAction.play();
      
      prevAction.crossFadeTo(targetAction, 1.0, true);
      currentActionRef.current = targetAction;
    }
  }, [isSpeaking, action, clips, randomIdleAction, randomTalkAction, isSitting]);

  useFrame((state, delta) => {
    if (!vrm) return;
    
    const hasMoCap = Object.keys(clips).length > 0;
    if (mixer && hasMoCap) mixer.update(delta);

    const t = state.clock.elapsedTime;
    const s = Math.sin;
    const h = vrm.humanoid;
    if (!h) return;

    // ── FALLBACK (Hanya jalan kalau gagal memuat FBX sama sekali) ──
    if (!hasMoCap) {
      const B = (name) => h.getNormalizedBoneNode(name);
      const spine = B('spine');
      const chest = B('chest');
      const rArm = B('rightUpperArm');
      const lArm = B('leftUpperArm');
      
      if (chest) chest.rotation.x = s(t * 1.5) * 0.02;
      if (spine) { spine.rotation.y = s(t * 0.8) * 0.015; spine.rotation.x = 0.03 + s(t * 1.2)*0.01; }
      if (rArm)  { rArm.rotation.z = 1.15; rArm.rotation.x = 0.05; }
      if (lArm)  { lArm.rotation.z = -1.15; lArm.rotation.x = 0.05; }
    }

    // ── EKSPRESI WAJAH & MULUT (MoCap tidak mengatur otot wajah) ──
    if (vrm.expressionManager) {
      ['happy','sad','surprised','angry','relaxed'].forEach(e =>
        vrm.expressionManager.setValue(e, 0)
      );
      
      // Jika menangis (Crying.fbx dimainkan karena jump/sentuh pundak), set ekspresi sad
      let expr = expression || 'relaxed';
      if (action === 'jump') expr = 'sad';
      else if (action === 'hug' || action === 'wave') expr = 'happy';
      
      vrm.expressionManager.setValue(expr, 0.85);

      // Kedip acak
      if (Math.random() < 0.007) {
        vrm.expressionManager.setValue('blink', 1.0);
        setTimeout(() => {
          if (vrm.expressionManager) vrm.expressionManager.setValue('blink', 0.0);
        }, 130);
      }
      
      // Gerak bibir saat bicara
      if (isSpeaking) {
        const syllable = (s(t * 15) + s(t * 22)) / 2; 
        vrm.expressionManager.setValue('aa', Math.max(0, syllable) * 0.12);
      } else {
        vrm.expressionManager.setValue('aa', 0);
      }
    }

    // ── MANIPULASI TULANG MANUAL (DUDUK) ──
    // Karena animasi duduk cacat, kita paksa tekuk kaki Miku secara matematika!
    if (isSitting && h) {
      const lUpper = h.getNormalizedBoneNode('leftUpperLeg');
      const lLower = h.getNormalizedBoneNode('leftLowerLeg');
      const rUpper = h.getNormalizedBoneNode('rightUpperLeg');
      const rLower = h.getNormalizedBoneNode('rightLowerLeg');
      
      if (lUpper && lLower && rUpper && rLower) {
        // Paha naik 90 derajat
        lUpper.rotation.x = -1.5;
        rUpper.rotation.x = -1.5;
        // Lutut turun 90 derajat
        lLower.rotation.x = 1.5;
        rLower.rotation.x = 1.5;
        // Buka sedikit paha agar terlihat rileks dan natural
        lUpper.rotation.z = 0.15;
        rUpper.rotation.z = -0.15;

        // Condongkan badan sedikit ke depan biar lebih rileks
        const spine = h.getNormalizedBoneNode('spine');
        if (spine) spine.rotation.x = 0.1;
      }
    }

    // Update VRM di akhir agar manipulasi tulang di atas di-apply ke raw bones & SpringBones
    vrm.update(delta);
  });

  if (!vrm) return null;
  return (
    <primitive
      object={vrm.scene}
      position={[0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (onBodyClick) onBodyClick(e.point.y, e.nativeEvent.clientX, e.nativeEvent.clientY);
      }}
    />
  );
}
