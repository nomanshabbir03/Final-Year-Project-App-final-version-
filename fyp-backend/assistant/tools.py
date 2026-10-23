"""Tools the chatbot can call. Every tool runs against the signed-in user's own data only:
the user comes from the verified auth token (ToolContext), never from model-supplied input."""
import datetime
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from django.db.models import Sum
from django.utils import timezone

from accounts.models import UserProfile
from budget.models import BudgetSettings, BudgetTransaction, CategoryBudget
from fitness.models import FitnessGoal, FitnessRecord, WaterIntake
from habits.models import Habit
from habits.services import complete_habit as complete_habit_streak
from medications.models import Medication, MedicationLog
from tasks.models import Task


@dataclass
class ToolContext:
    user: object

    @property
    def user_id(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        return profile.external_user_id


class ToolError(Exception):
    """Raised with a message the model can read and recover from."""


def _date(value, field='date'):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value))
    except ValueError:
        raise ToolError(f'{field} must be YYYY-MM-DD.')


def _amount(value):
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise ToolError('amount must be a number.')
    if amount <= 0:
        raise ToolError('amount must be greater than zero.')
    return amount


def _find(queryset, ref, name_field):
    """Resolve an item by numeric id or (partial) name; error if missing or ambiguous."""
    ref = str(ref).strip()
    if ref.isdigit():
        obj = queryset.filter(pk=int(ref)).first()
        if obj:
            return obj
    matches = list(queryset.filter(**{f'{name_field}__iexact': ref})[:2]) or list(
        queryset.filter(**{f'{name_field}__icontains': ref})[:3]
    )
    if not matches:
        raise ToolError(f'Nothing found matching "{ref}".')
    if len(matches) > 1:
        names = ', '.join(getattr(m, name_field) for m in matches)
        raise ToolError(f'"{ref}" is ambiguous (matches: {names}). Ask the user which one.')
    return matches[0]


def _task_dict(t):
    return {
        'id': t.id, 'title': t.title, 'description': t.description or '', 'category': t.category,
        'priority': t.priority, 'status': t.status,
        'deadline': t.deadline.isoformat() if t.deadline else None,
    }


# ---------------------------------------------------------------- tasks
def list_tasks(ctx, status=None):
    qs = Task.objects.filter(user=ctx.user)
    if status:
        qs = qs.filter(status=status)
    return {'tasks': [_task_dict(t) for t in qs[:50]]}


def create_task(ctx, title, description='', priority='medium', deadline=None, category=''):
    task = Task.objects.create(
        user=ctx.user, title=title.strip()[:255], description=description or '',
        priority=priority, deadline=_date(deadline, 'deadline'), category=category or '',
    )
    return {'created': _task_dict(task)}


def update_task(ctx, task, status=None, title=None, priority=None, deadline=None):
    t = _find(Task.objects.filter(user=ctx.user), task, 'title')
    if status:
        t.status = status
        if status == Task.STATUS_DONE:
            t.progress_percentage = 100
    if title:
        t.title = title[:255]
    if priority:
        t.priority = priority
    if deadline:
        t.deadline = _date(deadline, 'deadline')
    t.save()
    return {'updated': _task_dict(t)}


def delete_task(ctx, task):
    t = _find(Task.objects.filter(user=ctx.user), task, 'title')
    data = _task_dict(t)
    t.delete()
    return {'deleted': data}


# ---------------------------------------------------------------- medications
def get_medications_today(ctx):
    """Active medications with their schedule and what has been logged today."""
    today = timezone.localdate()
    meds = Medication.objects.filter(user=ctx.user, is_active=True)
    logs = MedicationLog.objects.filter(user=ctx.user, scheduled_time__date=today)
    by_med = {}
    for log in logs:
        by_med.setdefault(log.medication_id, []).append(
            {'status': log.status, 'scheduled_time': log.scheduled_time.isoformat()}
        )
    return {
        'date': today.isoformat(),
        'medications': [
            {
                'id': m.id, 'name': m.name, 'dosage': m.dosage, 'frequency': m.frequency,
                'schedule_times': m.schedule_times, 'notes': m.notes or '',
                'supply_count': m.supply_count, 'refill_threshold': m.refill_threshold,
                'logged_today': by_med.get(m.id, []),
            }
            for m in meds
        ],
    }


def add_medication(ctx, name, dosage, schedule_times, frequency='daily', notes=''):
    med = Medication.objects.create(
        user=ctx.user, name=name[:200], dosage=dosage[:100], frequency=frequency,
        schedule_times=list(schedule_times), notes=notes or '',
    )
    return {'created': {'id': med.id, 'name': med.name, 'dosage': med.dosage,
                        'frequency': med.frequency, 'schedule_times': med.schedule_times}}


def log_medication(ctx, medication, status='taken'):
    med = _find(Medication.objects.filter(user=ctx.user, is_active=True), medication, 'name')
    now = timezone.now()
    MedicationLog.objects.create(
        user=ctx.user, medication=med, status=status, scheduled_time=now,
        taken_at=now if status == 'taken' else None,
    )
    if status == 'taken' and med.supply_count > 0:
        med.supply_count -= 1
        med.save(update_fields=['supply_count'])
    return {'logged': {'medication': med.name, 'status': status}}


# ---------------------------------------------------------------- habits
def list_habits(ctx):
    today = timezone.localdate()
    return {'habits': [
        {'id': h.id, 'name': h.name, 'frequency': h.frequency, 'category': h.category,
         'streak': h.streak_count, 'best_streak': h.best_streak,
         'done_today': h.last_completed_date == today}
        for h in Habit.objects.filter(user_id=ctx.user_id)
    ]}


def create_habit(ctx, name, frequency='Daily', category='Other'):
    habit = Habit.objects.create(user_id=ctx.user_id, name=name[:255], frequency=frequency, category=category)
    return {'created': {'id': habit.id, 'name': habit.name, 'frequency': habit.frequency}}


def complete_habit(ctx, habit):
    h = _find(Habit.objects.filter(user_id=ctx.user_id), habit, 'name')
    complete_habit_streak(h, timezone.localdate())
    return {'completed': {'name': h.name, 'streak': h.streak_count, 'best_streak': h.best_streak}}


# ---------------------------------------------------------------- budget
def add_transaction(ctx, type, amount, category='', description='', date=None):
    tx = BudgetTransaction.objects.create(
        user_id=ctx.user_id, type=type, amount=_amount(amount), category=category or None,
        description=description or None, date=_date(date) or timezone.localdate(),
    )
    return {'created': {'id': str(tx.id), 'type': tx.type, 'amount': str(tx.amount),
                        'category': tx.category, 'date': tx.date.isoformat()}}


def get_budget_summary(ctx, month=None):
    """Income, spending and per-category budgets for a month (YYYY-MM, default current)."""
    today = timezone.localdate()
    if month:
        try:
            year, mon = (int(x) for x in month.split('-'))
            start = datetime.date(year, mon, 1)
        except ValueError:
            raise ToolError('month must be YYYY-MM.')
    else:
        start = today.replace(day=1)
    end = (start.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    txs = BudgetTransaction.objects.filter(user_id=ctx.user_id, date__gte=start, date__lt=end)

    def total(kind):
        return txs.filter(type=kind).aggregate(s=Sum('amount'))['s'] or Decimal('0')

    spent_by_cat = {
        (r['category'] or 'Uncategorized'): str(r['s'])
        for r in txs.filter(type='expense').values('category').annotate(s=Sum('amount'))
    }
    settings_obj = BudgetSettings.objects.filter(user_id=ctx.user_id).first()
    return {
        'month': start.strftime('%Y-%m'),
        'currency': settings_obj.currency if settings_obj else 'PKR',
        'monthly_limit': str(settings_obj.monthly_limit) if settings_obj and settings_obj.monthly_limit else None,
        'income': str(total('income')), 'expenses': str(total('expense')),
        'spent_by_category': spent_by_cat,
        'category_limits': {c.category: str(c.monthly_limit)
                            for c in CategoryBudget.objects.filter(user_id=ctx.user_id)},
        'recent': [
            {'type': t.type, 'amount': str(t.amount), 'category': t.category,
             'description': t.description, 'date': t.date.isoformat()}
            for t in txs.order_by('-date', '-created_at')[:10]
        ],
    }


# ---------------------------------------------------------------- fitness
def get_fitness_today(ctx):
    today = timezone.localdate()
    rec = FitnessRecord.objects.filter(user_id=ctx.user_id, date=today).first()
    water = WaterIntake.objects.filter(user_id=ctx.user_id, date=today).first()
    return {
        'date': today.isoformat(),
        'steps': rec.steps if rec else 0,
        'calories_burned': str(rec.calories_burned) if rec else '0',
        'sleep_minutes': rec.sleep_duration_minutes if rec else None,
        'water_ml': water.amount_ml if water else 0,
        'goals': {g.goal_type: str(g.target_value)
                  for g in FitnessGoal.objects.filter(user_id=ctx.user_id, is_active=True)},
    }


def log_water(ctx, amount_ml):
    if int(amount_ml) <= 0:
        raise ToolError('amount_ml must be positive.')
    water, _ = WaterIntake.objects.get_or_create(user_id=ctx.user_id, date=timezone.localdate())
    water.amount_ml += int(amount_ml)
    water.updated_at = timezone.now()
    water.save()
    return {'water_ml_today': water.amount_ml}


def log_fitness(ctx, steps=None, calories_burned=None, sleep_minutes=None):
    rec, _ = FitnessRecord.objects.get_or_create(user_id=ctx.user_id, date=timezone.localdate())
    if steps is not None:
        rec.steps = int(steps)
    if calories_burned is not None:
        rec.calories_burned = Decimal(str(calories_burned))
    if sleep_minutes is not None:
        rec.sleep_duration_minutes = int(sleep_minutes)
    rec.updated_at = timezone.now()
    rec.save()
    return {'today': {'steps': rec.steps, 'calories_burned': str(rec.calories_burned),
                      'sleep_minutes': rec.sleep_duration_minutes}}


def _tool(name, description, properties=None, required=None):
    return {
        'name': name, 'description': description,
        'input_schema': {'type': 'object', 'properties': properties or {},
                         'required': required or [], 'additionalProperties': False},
    }


_S = {'type': 'string'}
_ISO = {'type': 'string', 'description': 'Date as YYYY-MM-DD'}
_STATUS = {'type': 'string', 'enum': ['pending', 'in_progress', 'done']}
_PRIORITY = {'type': 'string', 'enum': ['low', 'medium', 'high']}

# name -> (definition, function, module touched). `module` lets the app refresh the right screen.
REGISTRY = {
    'list_tasks': (_tool('list_tasks', "List the user's tasks, optionally filtered by status.",
                         {'status': _STATUS}), list_tasks, 'tasks'),
    'create_task': (_tool('create_task', 'Add a new task for the user.', {
        'title': _S, 'description': _S, 'category': _S, 'priority': _PRIORITY, 'deadline': _ISO,
    }, ['title']), create_task, 'tasks'),
    'update_task': (_tool('update_task', 'Update a task (e.g. mark it done). `task` is its id or title.', {
        'task': _S, 'status': _STATUS, 'title': _S, 'priority': _PRIORITY, 'deadline': _ISO,
    }, ['task']), update_task, 'tasks'),
    'delete_task': (_tool('delete_task', 'Permanently delete a task. Only after the user confirmed.',
                          {'task': _S}, ['task']), delete_task, 'tasks'),
    'get_medications_today': (_tool(
        'get_medications_today',
        "The user's active medications with dosage, schedule times and what was already logged today."),
        get_medications_today, 'medications'),
    'add_medication': (_tool('add_medication', "Add a medication to the user's medication list.", {
        'name': _S, 'dosage': _S,
        'schedule_times': {'type': 'array', 'items': _S, 'description': '24h times, e.g. ["08:00","20:00"]'},
        'frequency': {'type': 'string',
                      'enum': ['daily', 'twice_daily', 'three_times_daily', 'weekly', 'as_needed']},
        'notes': _S,
    }, ['name', 'dosage', 'schedule_times']), add_medication, 'medications'),
    'log_medication': (_tool('log_medication', 'Record that a dose was taken or skipped just now.', {
        'medication': {'type': 'string', 'description': 'id or name'},
        'status': {'type': 'string', 'enum': ['taken', 'skipped']},
    }, ['medication']), log_medication, 'medications'),
    'list_habits': (_tool('list_habits', "List the user's habits with streaks and whether done today."),
                    list_habits, 'habits'),
    'create_habit': (_tool('create_habit', 'Create a new habit.', {
        'name': _S, 'frequency': {'type': 'string', 'enum': ['Daily', 'Weekly']},
        'category': {'type': 'string',
                     'enum': ['Health', 'Fitness', 'Study', 'Mindfulness', 'Finance', 'Other']},
    }, ['name']), create_habit, 'habits'),
    'complete_habit': (_tool('complete_habit', 'Mark a habit as done today. `habit` is its id or name.',
                             {'habit': _S}, ['habit']), complete_habit, 'habits'),
    'add_transaction': (_tool('add_transaction', 'Record an expense or income in the budget.', {
        'type': {'type': 'string', 'enum': ['expense', 'income']},
        'amount': {'type': 'number'}, 'category': _S, 'description': _S, 'date': _ISO,
    }, ['type', 'amount']), add_transaction, 'budget'),
    'get_budget_summary': (_tool(
        'get_budget_summary',
        'Income, expenses, per-category spending/limits and recent transactions for a month.',
        {'month': {'type': 'string', 'description': 'YYYY-MM, default current month'}}),
        get_budget_summary, 'budget'),
    'get_fitness_today': (_tool('get_fitness_today', "Today's steps, calories, sleep, water and fitness goals."),
                          get_fitness_today, 'fitness'),
    'log_water': (_tool('log_water', 'Add water intake (ml) to today.', {'amount_ml': {'type': 'integer'}},
                        ['amount_ml']), log_water, 'fitness'),
    'log_fitness': (_tool('log_fitness', "Set today's steps / calories burned / sleep minutes.", {
        'steps': {'type': 'integer'}, 'calories_burned': {'type': 'number'},
        'sleep_minutes': {'type': 'integer'},
    }), log_fitness, 'fitness'),
}

# Tools that only read; the app does not need to refresh after them.
READ_ONLY = {'list_tasks', 'get_medications_today', 'list_habits', 'get_budget_summary', 'get_fitness_today'}

TOOL_DEFINITIONS = [entry[0] for entry in REGISTRY.values()]


def run_tool(ctx, name, args):
    """Execute a tool. Returns (result_dict, is_error)."""
    entry = REGISTRY.get(name)
    if not entry:
        return {'error': f'Unknown tool {name}.'}, True
    try:
        return entry[1](ctx, **(args or {})), False
    except ToolError as exc:
        return {'error': str(exc)}, True
    except (TypeError, ValueError) as exc:
        return {'error': f'Invalid arguments: {exc}'}, True
