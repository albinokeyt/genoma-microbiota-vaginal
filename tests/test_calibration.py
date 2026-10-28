import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("vaginal", Path(__file__).resolve().parents[1] / "app" / "app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class CalibrationTests(unittest.TestCase):
    def test_persistent_targeted_repair(self):
        with tempfile.TemporaryDirectory() as folder:
            app.DATA_DIR = Path(folder)
            app.SETTINGS_PATH = app.DATA_DIR / "settings.json"
            saved = {"curves": {"total": {"m": -3.839, "b": 0, "factor": 1}, "lacto": {"m": -3.771, "b": 33.59}}, "report": {"footerText": "Preserve"}}
            app.save_settings(saved)
            result = app.load_settings()
            self.assertEqual(result["curves"]["total"]["b"], 36.094)
            self.assertEqual(result["curves"]["lacto"], saved["curves"]["lacto"])
            self.assertEqual(result["report"], saved["report"])
            self.assertEqual(json.loads(app.SETTINGS_PATH.read_text()), result)
            self.assertEqual(app.load_settings(), result)

    def test_reject_invalid_calibration(self):
        for slope, intercept in [(-3.839, 0), (-3.839, None), (3.839, 36.094), (float("nan"), 36.094)]:
            with self.subTest(slope=slope, intercept=intercept):
                with self.assertRaises((ValueError, TypeError)):
                    app.validate_calibration({"curves": {"total": {"m": slope, "b": intercept}}})
        app.validate_calibration({"curves": {"total": {"m": -3.839, "b": 36.094}}})


if __name__ == "__main__":
    unittest.main()
