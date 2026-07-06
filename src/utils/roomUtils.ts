import { ExamSlot, Booking, ObserverType } from '../types';

export function getSlotRooms(slot: ExamSlot): string[] {
  const rooms: string[] = [];
  
  const studios_from = slot.studios_from !== undefined ? Number(slot.studios_from) : 1;
  const studios_to = slot.studios_to !== undefined ? Number(slot.studios_to) : 8;
  const lobbies_from = slot.lobbies_from !== undefined ? Number(slot.lobbies_from) : 1;
  const lobbies_to = slot.lobbies_to !== undefined ? Number(slot.lobbies_to) : 3;
  const basements_from = slot.basements_from !== undefined ? Number(slot.basements_from) : 1;
  const basements_to = slot.basements_to !== undefined ? Number(slot.basements_to) : 3;
  const halls_from = slot.halls_from !== undefined ? Number(slot.halls_from) : 1;
  const halls_to = slot.halls_to !== undefined ? Number(slot.halls_to) : 2;
  const expansions_from = slot.expansions_from !== undefined ? Number(slot.expansions_from) : 1;
  const expansions_to = slot.expansions_to !== undefined ? Number(slot.expansions_to) : 6;

  if (slot.has_studios && studios_to >= studios_from) {
    for (let i = studios_from; i <= studios_to; i++) {
      rooms.push(`مرسم ${i}`);
    }
  }
  if (slot.has_lobbies && lobbies_to >= lobbies_from) {
    for (let i = lobbies_from; i <= lobbies_to; i++) {
      rooms.push(`بهو ${i}`);
    }
  }
  if (slot.has_basements && basements_to >= basements_from) {
    for (let i = basements_from; i <= basements_to; i++) {
      rooms.push(`قبو ${i}`);
    }
  }
  if (slot.has_halls && halls_to >= halls_from) {
    for (let i = halls_from; i <= halls_to; i++) {
      rooms.push(`قاعة ${i}`);
    }
  }
  if (slot.has_expansions && expansions_to >= expansions_from) {
    for (let i = expansions_from; i <= expansions_to; i++) {
      rooms.push(`توسع ${i}`);
    }
  }
  return rooms;
}

export function getObserverRoom(slot: ExamSlot, booking: Booking, bookingsForSlot: Booking[]): string {
  const rooms = getSlotRooms(slot);
  if (rooms.length === 0) return 'القاعة العامة';
  
  // Sort bookings to ensure deterministic ordering (by createdAt ascending, then by booking id)
  const sortedBookings = [...bookingsForSlot].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
  
  const limit = slot.observers_per_room !== undefined ? Number(slot.observers_per_room) : 3;
  
  // Initialize rooms state
  const roomsState = rooms.map(name => ({
    name,
    hasSecretary: false,
    hasEmployee: false,
    assignedBookings: [] as Booking[]
  }));
  
  const assignments: Record<string, string> = {};
  
  sortedBookings.forEach(b => {
    const type = b.observer_type || 'طالب دراسات';
    let assignedRoomName = '';
    
    if (type === 'أمين قاعة') {
      // Find first room without secretary that is not full
      const targetRoom = roomsState.find(r => !r.hasSecretary && r.assignedBookings.length < limit);
      if (targetRoom) {
        targetRoom.hasSecretary = true;
        targetRoom.assignedBookings.push(b);
        assignedRoomName = targetRoom.name;
      }
    } else if (type === 'موظف') {
      // Find first room without employee that is not full
      const targetRoom = roomsState.find(r => !r.hasEmployee && r.assignedBookings.length < limit);
      if (targetRoom) {
        targetRoom.hasEmployee = true;
        targetRoom.assignedBookings.push(b);
        assignedRoomName = targetRoom.name;
      }
    }
    
    // If not assigned yet (either because type is different, or because targeted rooms are full)
    if (!assignedRoomName) {
      const targetRoom = roomsState.find(r => r.assignedBookings.length < limit);
      if (targetRoom) {
        targetRoom.assignedBookings.push(b);
        assignedRoomName = targetRoom.name;
      } else {
        assignedRoomName = 'احتياط / إضافي';
      }
    }
    
    assignments[b.id] = assignedRoomName;
  });
  
  return assignments[booking.id] || 'غير محدد';
}
