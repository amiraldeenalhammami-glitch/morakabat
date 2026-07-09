import React, { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const DeveloperFooter: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [fbLink, setFbLink] = useState('https://www.facebook.com/amir.aldeen.alhammami/?locale=ar_AR');

  useEffect(() => {
    // Realtime listener for settings to update the link dynamically
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.developer_fb_link) {
          setFbLink(data.developer_fb_link);
        }
      }
    }, (error) => {
      console.warn("Error reading footer settings:", error);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className={`text-center py-4 ${className}`}>
      <p className="text-[11px] md:text-xs text-slate-400 font-sans">
        صمم هذا التطبيق بواسطة{' '}
        <a 
          href={fbLink} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-indigo-500 hover:text-indigo-600 font-bold hover:underline transition-colors"
        >
          المهندس المعماري أمير الدين الحمامي
        </a>
      </p>
    </div>
  );
};
