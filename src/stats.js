'use strict';

const DAY = 86400000;

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function countBy(list, fn) {
  const out = {};
  for (const item of list) {
    const k = fn(item) || '未分类';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function computeStats(data) {
  const entries = data.entries || [];
  const practice = data.practice || [];

  const byType = countBy(entries, (e) => e.type);
  const byStatus = countBy(entries, (e) => e.status);
  const total = entries.length;
  const mastered = byStatus.mastered || 0;
  const masteryRate = total ? Math.round((mastered / total) * 100) : 0;

  const now = Date.now();
  const due = entries
    .filter((e) => e.status !== 'mastered' && e.review && e.review.next_at && new Date(e.review.next_at).getTime() <= now)
    .sort((a, b) => new Date(a.review.next_at) - new Date(b.review.next_at));

  // 薄弱知识点：未掌握条目的重复次数与难度加权
  const topicMap = new Map();
  for (const e of entries) {
    const name = e.topic || '未分类';
    const cur = topicMap.get(name) || { name, total: 0, mastered: 0, unresolved: 0, score: 0 };
    cur.total += 1;
    if (e.status === 'mastered') {
      cur.mastered += 1;
    } else {
      cur.unresolved += 1;
      const occ = Math.max(1, Number(e.occurrences) || 1);
      const diff = Math.max(1, Number(e.difficulty) || 2);
      cur.score += 1 + (occ - 1) * 1.2 + diff * 0.4;
    }
    topicMap.set(name, cur);
  }
  const weakTopics = [...topicMap.values()]
    .map((t) => ({
      ...t,
      score: Math.round(t.score * 10) / 10,
      progress: t.total ? Math.round((t.mastered / t.total) * 100) : 0,
    }))
    .sort((a, b) => b.score - a.score || b.unresolved - a.unresolved);

  // 最近 12 周热力图（周一为一列起点）
  const today = startOfDay(new Date());
  const weekday = (today.getDay() + 6) % 7; // 0 = 周一
  const monday = new Date(today.getTime() - weekday * DAY);
  const start = new Date(monday.getTime() - 11 * 7 * DAY);

  const counts = new Map();
  const bump = (dateStr) => counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
  for (const ev of data.events || []) {
    if (!ev || !ev.at) continue;
    const d = new Date(ev.at);
    if (Number.isNaN(d.getTime())) continue;
    bump(dateKey(d));
  }
  // 兜底：即使没有事件，也按条目创建日期显示
  if (!(data.events || []).length) {
    for (const e of entries) {
      if (e.created_at) bump(dateKey(new Date(e.created_at)));
    }
  }

  const daily = [];
  for (let i = 0; i < 84; i += 1) {
    const d = new Date(start.getTime() + i * DAY);
    const key = dateKey(d);
    daily.push({ date: key, count: counts.get(key) || 0, weekday: i % 7 });
  }
  let maxDaily = 0;
  for (const d of daily) maxDaily = Math.max(maxDaily, d.count);

  // 连续活跃天数
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const d = new Date(today.getTime() - i * DAY);
    const c = counts.get(dateKey(d)) || 0;
    if (c > 0) streak += 1;
    else if (i === 0) continue; // 今天还没动不算断
    else break;
  }

  // 高频标签
  const tagCount = new Map();
  for (const e of entries) {
    for (const t of e.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const topTags = [...tagCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const practiceStats = {
    total: practice.length,
    done: practice.filter((p) => p.status === 'done').length,
    todo: practice.filter((p) => p.status !== 'done').length,
    attempts: practice.reduce((s, p) => s + (Number(p.attempts) || 0), 0),
    correct: practice.reduce((s, p) => s + (Number(p.correct) || 0), 0),
  };
  practiceStats.accuracy = practiceStats.attempts ? Math.round((practiceStats.correct / practiceStats.attempts) * 100) : 0;

  const weekAgo = now - 7 * DAY;
  const weekEvents = (data.events || []).filter((e) => new Date(e.at).getTime() >= weekAgo);
  const week = {
    total: weekEvents.length,
    created: weekEvents.filter((e) => e.type === 'entry_created').length,
    review: weekEvents.filter((e) => e.type === 'review').length,
    attempt: weekEvents.filter((e) => e.type === 'attempt').length,
  };

  return {
    total,
    mastered,
    unresolved: total - mastered,
    masteryRate,
    byType,
    byStatus,
    dueCount: due.length,
    dueEntries: due.slice(0, 8).map((e) => ({ id: e.id, title: e.title, topic: e.topic, next_at: e.review.next_at })),
    weakTopics,
    daily,
    maxDaily,
    streak,
    topTags,
    practice: practiceStats,
    week,
    thisWeek: week.total,
    dailyTarget: Number(data.profile && data.profile.daily_target) || 3,
  };
}

module.exports = { computeStats, dateKey, startOfDay };
