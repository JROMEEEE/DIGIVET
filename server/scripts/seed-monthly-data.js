// Seeds varied vaccination records across the last 8 months for chart testing.
// Cleans up previous seed data first, then re-inserts.
// Run: node scripts/seed-monthly-data.js
import 'dotenv/config';
import crypto from 'node:crypto';
import { pool, bootstrapSchema } from '../src/local/db.js';

function approvalCode(date) {
  const year = new Date(date).getFullYear();
  const hex  = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `AP-${year}-${hex}`;
}

const VACCINES = [
  { detail: 'Anti-Rabies Vaccine, 1mL IM',                   lot: 'ARV' },
  { detail: 'Distemper-Parvovirus (DHPP), 1mL SC',           lot: 'DHP' },
  { detail: 'Bordetella Bronchiseptica, 0.5mL intranasal',   lot: 'BRD' },
  { detail: 'Leptospirosis, 1mL IM',                         lot: 'LEP' },
  { detail: 'Feline Herpesvirus (FVRCP), 1mL SC',            lot: 'FVR' },
  { detail: 'Anti-Rabies Booster, 1mL IM',                   lot: 'ARB' },
  { detail: 'Canine Influenza, 1mL IM',                      lot: 'CIV' },
  { detail: 'Parvovirus Booster, 0.5mL SC',                  lot: 'PVB' },
];

const MOCK_PETS = [
  { name: 'Bantay',    type: 'Dog', age: '3 yrs',  color: 'Brown'       },
  { name: 'Mingming',  type: 'Cat', age: '2 yrs',  color: 'Orange'      },
  { name: 'Tagpi',     type: 'Dog', age: '5 yrs',  color: 'Black/White' },
  { name: 'Tisoy',     type: 'Dog', age: '1 yr',   color: 'Golden'      },
  { name: 'Kuting',    type: 'Cat', age: '8 mos',  color: 'Gray'        },
  { name: 'Brownie',   type: 'Dog', age: '4 yrs',  color: 'Brown'       },
  { name: 'Pusa',      type: 'Cat', age: '3 yrs',  color: 'White'       },
  { name: 'Bunso',     type: 'Dog', age: '6 mos',  color: 'Spotted'     },
  { name: 'Rex',       type: 'Dog', age: '2 yrs',  color: 'Black'       },
  { name: 'Snowball',  type: 'Cat', age: '1 yr',   color: 'White'       },
  { name: 'Blackie',   type: 'Dog', age: '3 yrs',  color: 'Black'       },
  { name: 'Mimi',      type: 'Cat', age: '4 yrs',  color: 'Calico'      },
  { name: 'Choco',     type: 'Dog', age: '2 yrs',  color: 'Dark Brown'  },
  { name: 'Tiger',     type: 'Cat', age: '5 yrs',  color: 'Orange/Black'},
  { name: 'Lucky',     type: 'Dog', age: '1 yr',   color: 'Cream'       },
  { name: 'Aspong',    type: 'Dog', age: '7 yrs',  color: 'Tan'         },
  { name: 'Bruno',     type: 'Dog', age: '3 yrs',  color: 'Brown'       },
  { name: 'Kitty',     type: 'Cat', age: '2 yrs',  color: 'Gray/White'  },
  { name: 'Tabby',     type: 'Cat', age: '3 yrs',  color: 'Tabby'       },
  { name: 'Buntot',    type: 'Dog', age: '4 yrs',  color: 'White/Brown' },
]

const MONTHS = [
  { offset: 7, count: 3  },
  { offset: 6, count: 5  },
  { offset: 5, count: 8  },
  { offset: 4, count: 6  },
  { offset: 3, count: 11 },
  { offset: 2, count: 9  },
  { offset: 1, count: 14 },
  { offset: 0, count: 7  },
];

function monthDate(monthOffset, day) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthOffset);
  d.setDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
}

try {
  await bootstrapSchema();

  // Clean up previous seed data (identified by lot prefix + mock pet names)
  const mockNames = MOCK_PETS.map(p => p.name);
  const oldPets = await pool.query(
    `SELECT pet_id FROM pet_table WHERE pet_name = ANY($1)`,
    [mockNames],
  );
  const oldPetIds = oldPets.rows.map(r => r.pet_id);

  if (oldPetIds.length) {
    const cleaned = await pool.query(
      `DELETE FROM vaccine_table WHERE pet_id = ANY($1)
       RETURNING approval_id`,
      [oldPetIds],
    );
    const approvalIds = cleaned.rows.map(r => r.approval_id).filter(Boolean);
    if (approvalIds.length) {
      await pool.query(`DELETE FROM approval_id_table WHERE approval_id = ANY($1)`, [approvalIds]);
    }
    await pool.query(`DELETE FROM pet_table WHERE pet_id = ANY($1)`, [oldPetIds]);
    console.log(`Cleaned up ${oldPetIds.length} mock pets and ${cleaned.rows.length} vaccination records.\n`);
  }

  const vets = (await pool.query('SELECT vet_id FROM vet_table LIMIT 5')).rows;
  const owners = (await pool.query('SELECT owner_id FROM owner_table LIMIT 20')).rows;

  if (!vets.length || !owners.length) {
    console.error('No vets or owners found. Add some records first via the Encode page.');
    process.exit(1);
  }

  // Create mock pets with varied names attached to existing owners
  const pets = [];
  for (let i = 0; i < MOCK_PETS.length; i++) {
    const p = MOCK_PETS[i];
    const owner = owners[i % owners.length];
    const { rows } = await pool.query(
      `INSERT INTO pet_table (owner_id, pet_name, pet_type, pet_age, pet_color)
       VALUES ($1, $2, $3, $4, $5) RETURNING pet_id`,
      [owner.owner_id, p.name, p.type, p.age, p.color],
    );
    pets.push(rows[0]);
  }
  console.log(`Created ${pets.length} mock pets.\n`);

  let total = 0;
  let vaccineIdx = 0;

  for (const { offset, count } of MONTHS) {
    for (let i = 0; i < count; i++) {
      const pet     = pets[i % pets.length];
      const vet     = vets[i % vets.length];
      const vaccine = VACCINES[vaccineIdx % VACCINES.length];
      vaccineIdx++;

      const day  = 3 + (i * 3 % 25);
      const date = monthDate(offset, day);
      const code = approvalCode(date);
      const lot  = `${vaccine.lot}-${date.slice(2, 4)}${date.slice(5, 7)}-${String(i + 1).padStart(3, '0')}`;

      const { rows: ap } = await pool.query(
        `INSERT INTO approval_id_table (vet_id, approval_code)
         VALUES ($1, $2) RETURNING approval_id`,
        [vet.vet_id, code],
      );

      await pool.query(
        `INSERT INTO vaccine_table
           (pet_id, vet_id, approval_id, vaccine_date, vaccine_details, manufacturer_no, is_office_visit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pet.pet_id, vet.vet_id, ap[0].approval_id, date, vaccine.detail, lot, false],
      );

      total++;
    }
    console.log(`✓ Month -${offset}: inserted ${count} records`);
  }

  console.log(`\nDone — ${total} records added across ${MONTHS.length} months.`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
