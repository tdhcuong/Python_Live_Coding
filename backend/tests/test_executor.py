"""Unit tests for the Python code executor module (EXEC-01, EXEC-03)."""
import pytest
from app.executor import run_python_sync, run_python_async, ExecutionResult


class TestExecutorUnit:
    """Unit tests for run_python_sync and run_python_async."""

    def test_simple_print(self):
        """run_python_sync with print returns stdout, no stderr, exit 0."""
        result = run_python_sync('print("hello")')
        assert isinstance(result, ExecutionResult)
        assert result.stdout == "hello\n"
        assert result.stderr == ""
        assert result.exit_code == 0
        assert result.timed_out is False

    def test_syntax_error(self):
        """Syntax error produces exit_code != 0 and stderr containing SyntaxError."""
        result = run_python_sync("def")
        assert result.exit_code != 0
        assert "SyntaxError" in result.stderr

    def test_stderr_output(self):
        """Code writing to stderr is captured in result.stderr."""
        result = run_python_sync('import sys; sys.stderr.write("err")')
        assert "err" in result.stderr

    def test_infinite_loop_timeout(self):
        """Infinite loop is killed and timed_out=True with short timeout."""
        result = run_python_sync("while True: pass", timeout=2)
        assert result.timed_out is True
        assert result.exit_code != 0
        assert "Timed out" in result.stderr

    def test_stdout_cap(self):
        """stdout is capped at 50 KB (50000 bytes)."""
        result = run_python_sync('print("x" * 60000)')
        assert len(result.stdout) <= 50000

    def test_stderr_cap(self):
        """stderr is capped at 10 KB (10000 bytes)."""
        code = 'import sys; sys.stderr.write("e" * 20000)'
        result = run_python_sync(code)
        assert len(result.stderr) <= 10000

    def test_stripped_env(self):
        """HOME environment variable should not be visible to the subprocess."""
        result = run_python_sync(
            'import os; print(os.environ.get("HOME", "NONE"))'
        )
        assert "NONE" in result.stdout

    @pytest.mark.anyio
    async def test_async_wrapper(self):
        """run_python_async returns correct ExecutionResult via asyncio.to_thread."""
        result = await run_python_async('print("async")')
        assert isinstance(result, ExecutionResult)
        assert result.stdout == "async\n"
        assert result.exit_code == 0
        assert result.timed_out is False
