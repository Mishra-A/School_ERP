const { pool, withTransaction } = require('../config/db');
const { logActivity } = require('../utils/activityLog');

async function getScale() {
  const [rows] = await pool.query('SELECT grade, min_percent AS minPercent FROM grade_scale ORDER BY min_percent DESC');
  return rows;
}

// The grade of the highest band whose minimum the percentage reaches. Using only the minimum means
// scores such as 89.995 never fall into a gap between bands.
function gradeFor(percentage, scale) {
  if (percentage === null || percentage === undefined) return null;
  const hit = scale.find((g) => percentage >= g.minPercent);
  return hit ? hit.grade : null;
}

// Replaces the whole scale. max_percent is derived: 100 for the top grade, otherwise just under the next one up.
async function saveScale(actorId, { grades }) {
  const sorted = [...grades].sort((a, b) => b.minPercent - a.minPercent);
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM grade_scale');
    for (let i = 0; i < sorted.length; i += 1) {
      const max = i === 0 ? 100 : Math.round((sorted[i - 1].minPercent - 0.01) * 100) / 100;
      await conn.query('INSERT INTO grade_scale (grade, min_percent, max_percent) VALUES (?, ?, ?)', [sorted[i].grade, sorted[i].minPercent, max]);
    }
  });
  await logActivity(actorId, 'grade_scale_updated', 'grade_scale', null);
}

module.exports = { getScale, gradeFor, saveScale };
