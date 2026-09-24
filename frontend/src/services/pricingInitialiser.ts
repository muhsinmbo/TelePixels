import { doc, setDoc, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_PRICING = [
  // X-Ray Procedures
  { partName: "Chest (Thorax)", price: 150 },
  { partName: "Abdomen (KUB)", price: 180 },
  { partName: "Cervical Spine", price: 120 },
  { partName: "Lumbar Spine", price: 130 },
  { partName: "Thoracic Spine", price: 130 },
  { partName: "Pelvis", price: 140 },
  { partName: "Skull (Cranium)", price: 160 },
  { partName: "Knee Joint", price: 110 },
  { partName: "Ankle (Tarsals)", price: 100 },
  { partName: "Shoulder (Glenohumeral)", price: 115 },
  { partName: "Wrist (Carpals)", price: 95 },
  { partName: "Hand (Metacarpals)", price: 90 },
  { partName: "Foot (Metacarpals)", price: 90 },
  { partName: "Elbow", price: 105 },
  { partName: "Humerus", price: 110 },
  { partName: "Femur", price: 130 },
  { partName: "Lower Leg (Tibia/Fibula)", price: 120 },
  { partName: "Forearm (Radius/Ulna)", price: 110 },

  // Mammography
  { partName: "Mammography (Bilateral)", price: 250 },

  // Ultrasound Procedures
  { partName: "Abdominal Ultrasound", price: 150 },
  { partName: "Pelvic Ultrasound", price: 120 },
  { partName: "Abdominopelvic Ultrasound", price: 200 },
  { partName: "Obstetric Ultrasound", price: 100 },
  { partName: "KUB Ultrasound", price: 130 },
  { partName: "Prostate Ultrasound", price: 150 },
  { partName: "Breast Ultrasound", price: 150 },
  { partName: "Thyroid Ultrasound", price: 140 },
  { partName: "Scrotal Ultrasound", price: 140 },
  { partName: "Doppler Ultrasound (Lower Limb)", price: 180 },
  { partName: "Doppler Ultrasound (Upper Limb)", price: 180 },
  { partName: "Carotid Doppler Ultrasound", price: 220 },
  { partName: "Transvaginal Ultrasound", price: 160 },
  { partName: "Musculoskeletal (MSK) Ultrasound", price: 170 },
  { partName: "Transfontanelle Ultrasound", price: 150 },
  { partName: "Follicular Tracking", price: 250 },

  // Echo Procedures
  { partName: "Echocardiography (Adult)", price: 400 },
  { partName: "Echocardiography (Pediatric)", price: 350 },
  { partName: "Echocardiography (Fetal)", price: 450 },
  { partName: "Stress Echocardiography", price: 500 },

  // ECG Procedures
  { partName: "ECG (12-Lead)", price: 80 },
  { partName: "ECG Rhythm Strip", price: 60 },
  { partName: "Holter Monitor (24h)", price: 300 },
  { partName: "Cardiac Stress Test (ECG)", price: 250 }
];

export async function seedDefaultPricing(facilityId = 'default-facility') {
  try {
    const pricingRef = collection(db, 'facilities', facilityId, 'pricing');
    const snapshot = await getDocs(pricingRef);
    const existingDocIds = new Set(snapshot.docs.map(doc => doc.id));
    
    console.log(`Checking/Seeding default pricing for facility: ${facilityId}`);
    let seededCount = 0;
    
    for (const item of DEFAULT_PRICING) {
      const docId = item.partName.replace(/[^a-zA-Z0-9]/g, '_');
      if (!existingDocIds.has(docId)) {
        await setDoc(doc(pricingRef, docId), {
          partName: item.partName,
          price: item.price,
          currency: 'GHS',
          status: 'approved',
          updatedAt: serverTimestamp()
        });
        seededCount++;
      }
    }
    
    if (seededCount > 0) {
      console.log(`Seeded ${seededCount} missing default pricing entries successfully`);
    } else {
      console.log('All default pricing entries already existed');
    }
  } catch (error) {
    console.error('Failed to seed default pricing:', error);
  }
}
