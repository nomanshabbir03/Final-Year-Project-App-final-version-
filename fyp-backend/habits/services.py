from .models import Habit, HabitCompletion


def complete_habit(habit, today):
	"""Mark a habit done for `today`, updating its streak. Returns the habit."""
	if habit.last_completed_date == today:
		return habit

	if habit.last_completed_date is None:
		habit.streak_count = 1
	else:
		day_delta = (today - habit.last_completed_date).days

		if habit.frequency == Habit.FREQUENCY_DAILY:
			habit.streak_count = habit.streak_count + 1 if day_delta == 1 else 1
		else:
			habit.streak_count = habit.streak_count + 1 if 1 <= day_delta <= 7 else 1

	if habit.streak_count > habit.best_streak:
		habit.best_streak = habit.streak_count

	habit.last_completed_date = today
	habit.save(update_fields=['streak_count', 'best_streak', 'last_completed_date'])
	HabitCompletion.objects.get_or_create(habit=habit, completed_date=today)
	return habit
