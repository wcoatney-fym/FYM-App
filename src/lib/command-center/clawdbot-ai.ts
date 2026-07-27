import { Task } from './types';

const responses = {
  greeting: [
    "Let's cut through the noise. What's the one thing that will move the needle today?",
    "I've been analyzing your pipelines. Three things need your attention immediately.",
    "Revenue doesn't wait. Let's prioritize what drives the most profit right now.",
  ],
  taskAdvice: [
    "Based on workload analysis, {assignee} has bandwidth for this. Their {skill} score of {score}/10 makes them the ideal fit. Assigning difficulty {difficulty} tasks to high-skill team members reduces completion time by 40%.",
    "This task directly impacts your bottom line. Priority escalation recommended. Every day of delay costs approximately ${cost} in lost opportunity.",
    "I've identified a dependency chain. Complete this before moving to the next pipeline stage, or you'll create a bottleneck that cascades through your recruiting follow-up.",
  ],
  pipelineInsights: [
    "Your CPL on Facebook is ${cpl} - that's 15% below industry average. Scale this campaign NOW before the algorithm shifts. I'd recommend increasing daily spend by 30%.",
    "Show rate at {rate}% tells me your appointment confirmation sequence needs work. Add a same-day reminder SMS and expect a 12-15% improvement based on industry benchmarks.",
    "Cancellation pattern detected: 'found cheaper' is your #2 reason. This isn't a price problem - it's a value perception gap in your initial presentation. Tighten your opening pitch.",
  ],
  retention: [
    "Agent {name} hasn't been contacted in {days} days. Their engagement score dropped from 78 to {score}. One call today could save ${revenue} in annual overrides.",
    "Persistency warning: 3 policies hitting month-11. Historical data shows 67% lapse rate without intervention. Contact these clients THIS WEEK.",
    "Your retention rate dropped 2 points. That's not noise - that's a trend. Deploy the re-engagement workflow I built last week to the at-risk segment.",
  ],
  revenue: [
    "MTD revenue is tracking 4% below projection. Good news: you have $50K in pending placements. Pressure point is the 3 policies waiting carrier approval - follow up today.",
    "Commission breakdown shows recruiting overrides are underperforming. Your 3 newest agents aren't producing yet. Assign them the lead gen follow-up tasks to get reps in.",
    "Revenue per lead is ${rpl}. To hit your Q3 target, either increase lead volume by 20% or improve conversion rate by 8%. I recommend both - different team members can own each.",
  ],
  accountability: [
    "No excuses. You have 4 overdue tasks and 2 are P1 priority. Drop everything else until these are cleared. Which one are you tackling first?",
    "I notice {name} has had a task 'in progress' for 5 days. Average completion for similar tasks is 2 days. Time for a status check.",
    "Pipeline velocity slowed 22% this week. That directly correlates with the 3 unresponded leads aging past 48 hours. Speed to lead is non-negotiable.",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateClawdBotResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('task') || lower.includes('assign') || lower.includes('priority')) {
    return pickRandom(responses.taskAdvice)
      .replace('{assignee}', 'Sarah')
      .replace('{skill}', 'marketing')
      .replace('{score}', '9')
      .replace('{difficulty}', '7')
      .replace('{cost}', '450');
  }

  if (lower.includes('lead') || lower.includes('campaign') || lower.includes('ad')) {
    return pickRandom(responses.pipelineInsights)
      .replace('{cpl}', '29.93')
      .replace('{rate}', '72');
  }

  if (lower.includes('cancel') || lower.includes('retain') || lower.includes('persist') || lower.includes('lapse')) {
    return pickRandom(responses.retention)
      .replace('{name}', 'Patricia Lee')
      .replace('{days}', '18')
      .replace('{score}', '45')
      .replace('{revenue}', '23,000');
  }

  if (lower.includes('revenue') || lower.includes('money') || lower.includes('profit') || lower.includes('commission')) {
    return pickRandom(responses.revenue)
      .replace('{rpl}', '165');
  }

  if (lower.includes('overdue') || lower.includes('behind') || lower.includes('slow') || lower.includes('accountab')) {
    return pickRandom(responses.accountability)
      .replace('{name}', 'David');
  }

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('start')) {
    return pickRandom(responses.greeting);
  }

  return `Here's my assessment: ${pickRandom(responses.accountability).replace('{name}', 'the team')}\n\nFocus on revenue-generating activities first. Everything else is noise until the money-making machine is running. What specific area do you want me to drill into?`;
}

export function generateTaskSuggestion(context: string): Task {
  const suggestions: Partial<Task>[] = [
    { title: 'Follow up with aging leads (48h+)', category: 'Lead Gen', priority: 'P1', difficulty: 4 },
    { title: 'Re-engage at-risk retention client', category: 'Retention', priority: 'P1', difficulty: 6 },
    { title: 'Optimize underperforming ad group CPC', category: 'Lead Gen', priority: 'P2', difficulty: 5 },
    { title: 'Schedule pre-lapse check-in calls', category: 'Retention', priority: 'P1', difficulty: 3 },
    { title: 'Review and escalate pending placements', category: 'Revenue', priority: 'P2', difficulty: 4 },
  ];

  const suggestion = pickRandom(suggestions);
  return {
    id: `ai-${Date.now()}`,
    title: suggestion.title!,
    description: `AI-generated task based on: ${context}`,
    assigneeId: 'tm5',
    priority: suggestion.priority as Task['priority'],
    category: suggestion.category as Task['category'],
    status: 'todo',
    difficulty: suggestion.difficulty!,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: new Date().toISOString().split('T')[0],
    aiGenerated: true,
  };
}

export function generateInsights(): string[] {
  return [
    "12 leads unresponsive for 48+ hours - conversion probability dropping 3% per hour of delay",
    "Placement pipeline has $65,800 pending approval - follow up with carriers today",
    "Agent Patricia Lee engagement at 45/100 - schedule intervention call before EOD",
    "Cancellation rate trending up 8% MoM - deploy counter-offer workflow to at-risk segment",
    "Recruiting pipeline: 2 candidates stalled in interview stage 5+ days - decision needed",
  ];
}
