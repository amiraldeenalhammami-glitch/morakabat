import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ExamSlot } from '../types';

/**
 * Fetches all active (non-deleted) exam slots, strips any heavy student_distribution lists,
 * aggregates them into a single document under 'publicSchedule/current', and increments the
 * global settings version in 'settings/global'.
 */
export async function compileAndPublishSchedule() {
  try {
    const settingsRef = doc(db, 'settings', 'global');
    const settingsDoc = await getDoc(settingsRef);
    if (!settingsDoc.exists()) {
      console.warn('Global settings doc not found.');
      return;
    }
    
    const settingsData = settingsDoc.data();
    
    // Fetch all exam slots
    const slotsSnap = await getDocs(collection(db, 'exam_slots'));
    const activeSlots = slotsSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as ExamSlot))
      .filter(s => s.isDeleted !== true);
      
    // Strip any student_distribution or heavy arrays to keep the aggregated document ultra-light
    const cleanedSlots = activeSlots.map((slot) => {
      const cleaned = { ...slot };
      // @ts-ignore
      delete cleaned.student_distribution;
      return cleaned;
    });
    
    const nextVersion = (settingsData.global_settings_version || 0) + 1;
    
    // Write aggregated schedule
    await setDoc(doc(db, 'publicSchedule', 'current'), {
      slots: cleanedSlots,
      version: nextVersion,
      updatedAt: new Date().toISOString()
    });
    
    // Update global settings version
    await setDoc(settingsRef, {
      ...settingsData,
      global_settings_version: nextVersion
    });
    
    return nextVersion;
  } catch (error) {
    console.error('Failed to compile and publish public schedule:', error);
    throw error;
  }
}
