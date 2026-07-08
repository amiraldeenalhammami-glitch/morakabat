import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Booking, ExamSlot, UserProfile } from '../types';

/**
 * Checks if the automated quota trimming script needs to run, and if so, executes it.
 * This runs client-side whenever the Admin Dashboard or Student Dashboard is loaded.
 * It uses a flag to ensure it only processes once per scheduled run.
 */
export async function checkAndRunTrimming() {
  try {
    const settingsRef = doc(db, 'settings', 'global');
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists()) return;
    
    const settings = settingsSnap.data();
    const deadlineStr = settings.trim_hours_deadline;
    const processed = settings.trim_hours_processed;
    
    if (!deadlineStr || processed) {
      return; // No active trimming scheduled, or already processed
    }
    
    const deadline = new Date(deadlineStr);
    const now = new Date();
    
    if (now >= deadline) {
      console.log('Automated trimming deadline reached. Executing Trimming Script...');
      
      // 1. Instantly mark as processed to prevent race conditions and multiple triggers
      await updateDoc(settingsRef, {
        trim_hours_processed: true,
        trim_hours_deadline: null // clear the active countdown
      });
      
      const targetHours = settings.trim_hours_target || settings.default_required_hours || 16;
      await executeTrimming(targetHours);
    }
  } catch (err) {
    console.error('Error during automatic trimming check:', err);
  }
}

/**
 * Performs the actual trimming of bookings for students exceeding the target hours.
 */
export async function executeTrimming(targetHours: number) {
  try {
    console.log(`Starting trimming to target hours: ${targetHours}`);
    
    // Fetch all active students
    const studentsQuery = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('status', '==', 'active')
    );
    const studentsSnap = await getDocs(studentsQuery);
    const students = studentsSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
    
    // Fetch all exam slots (to filter out deleted ones)
    const slotsSnap = await getDocs(collection(db, 'exam_slots'));
    const slots = slotsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExamSlot));
    const activeSlotIds = new Set(slots.filter(s => !s.isDeleted).map(s => s.id));
    
    // Fetch all bookings
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    
    let totalCancelledCount = 0;

    for (const student of students) {
      // Calculate student's required hours (respect manual hours if set)
      const required = student.required_hours_mode === 'manual' 
        ? (student.required_hours ?? targetHours) 
        : targetHours;
        
      // Filter student's active bookings
      const studentBookings = bookings.filter(b => b.student_id === student.uid && activeSlotIds.has(b.slot_id));
      const totalBookedHours = studentBookings.reduce((sum, b) => sum + Math.abs(Number(b.booked_hours || 0)), 0);
      
      if (totalBookedHours > required) {
        console.log(`Student ${student.name} (${student.uid}) exceeds quota: ${totalBookedHours}/${required}`);
        
        let currentHours = totalBookedHours;
        const bookingsToCancel: Booking[] = [];
        let tempBookings = [...studentBookings];
        
        // Sorting bookings by duration in descending order, or keep creation order?
        // Let's sort by booked_hours so we can inspect 2-hour slots, but keep deterministic order.
        // The user specifically requested:
        // 1. Look for booking of exactly 2 hours (isDeleted = false, which is activeSlotIds checked).
        // 2. Exception protection: if no 2-hour booking, delete exactly ONE booking of any other duration.
        
        while (currentHours > required && tempBookings.length > 0) {
          const idx2 = tempBookings.findIndex(b => Math.abs(Number(b.booked_hours)) === 2);
          if (idx2 !== -1) {
            const b = tempBookings[idx2];
            bookingsToCancel.push(b);
            tempBookings.splice(idx2, 1);
            currentHours -= 2;
          } else {
            // No 2-hour booking found. Delete the first available booking to reduce the hours further.
            const b = tempBookings[0];
            bookingsToCancel.push(b);
            tempBookings.splice(0, 1);
            currentHours -= Math.abs(Number(b.booked_hours));
          }
        }
        
        // Execute the deletion of cancelled bookings in Firestore
        for (const booking of bookingsToCancel) {
          console.log(`Trimming booking: ${booking.course_name} (${booking.booked_hours} hrs) for ${student.name}`);
          await deleteDoc(doc(db, 'bookings', booking.id));
          totalCancelledCount++;
        }
      }
    }
    
    console.log(`Trimming completed successfully. Total bookings trimmed: ${totalCancelledCount}`);
  } catch (err) {
    console.error('Error during executeTrimming:', err);
  }
}
