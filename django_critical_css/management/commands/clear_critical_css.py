from django.core.management.base import BaseCommand

from django_critical_css.models import CriticalCSS


class Command(BaseCommand):
    help = "Remove all stored critical CSS from the database"

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-confirm",
            action="store_true",
            help="Skip confirmation prompt and delete all critical CSS immediately",
        )

    def handle(self, *args, **options):
        # Count existing entries
        css_count = CriticalCSS.objects.count()

        if css_count == 0:
            self.stdout.write(
                self.style.SUCCESS("No critical CSS entries found to remove.")
            )
            return

        # Show confirmation unless --no-confirm is used
        if not options["no_confirm"]:
            self.stdout.write(
                f"This will remove {css_count} critical CSS entries from the database."
            )
            confirm = input("Are you sure you want to continue? [y/N]: ")
            if confirm.lower() not in ["y", "yes"]:
                self.stdout.write(self.style.WARNING("Operation cancelled."))
                return

        # Delete all critical CSS entries
        deleted_count, _ = CriticalCSS.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully removed {deleted_count} critical CSS entries."
            )
        )
