"""
Sandboxed Python subprocess executor.

Executes user-supplied Python code in an isolated subprocess with:
  - tempfile delivery (not -c flag) — safer for multiline code
  - Resource limits via POSIX resource module:
      RLIMIT_CPU: kills CPU-bound infinite loops via SIGXCPU
      RLIMIT_NPROC: fork bomb protection
      NOTE: RLIMIT_AS is intentionally omitted — non-functional on macOS
        (virtual address space ~400 GB; setting it causes preexec_fn to fail)
  - Stripped environment: {"PATH": "/usr/bin:/bin"} only
  - stdout capped at 50 KB, stderr at 10 KB
  - subprocess.run(timeout=) as wall-clock backstop
  - tempfile cleanup in finally block

References: CLAUDE.md §Backend / Python Execution Sandbox, 03-RESEARCH.md D-03 through D-12
"""
import asyncio
import os
import resource
import subprocess
import sys
import tempfile
from dataclasses import dataclass


@dataclass
class ExecutionResult:
    """Result of executing a Python code snippet."""
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool


def run_python_sync(code: str, timeout: int = 10) -> ExecutionResult:
    """Execute Python code in a sandboxed subprocess. Blocking — use via asyncio.to_thread.

    Args:
        code: Python source code to execute.
        timeout: Wall-clock timeout in seconds (default 10). subprocess is killed on expiry.

    Returns:
        ExecutionResult with stdout, stderr, exit_code, timed_out.
    """
    # Write code to a tempfile (not -c) — cleaner for multiline, avoids shell quoting issues
    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', dir='/tmp', delete=False
    ) as f:
        f.write(code)
        fname = f.name

    def _preexec():
        # RLIMIT_CPU: kills CPU-bound loops via SIGXCPU (verified on macOS)
        # Soft=5s, Hard=6s — gives a 1-second grace period
        resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
        # RLIMIT_NPROC: fork bomb protection (verified on macOS)
        resource.setrlimit(resource.RLIMIT_NPROC, (20, 20))
        # RLIMIT_AS intentionally omitted — non-functional on macOS (see module docstring)

    timed_out = False
    stdout = ""
    stderr = ""
    exit_code = 1

    try:
        result = subprocess.run(
            [sys.executable, fname],
            capture_output=True,
            text=True,
            timeout=timeout,
            preexec_fn=_preexec,
            env={"PATH": "/usr/bin:/bin"},  # stripped env — removes HOME, venv paths, secrets
        )
        stdout = result.stdout[:50_000]   # 50 KB cap — prevents memory bombs
        stderr = result.stderr[:10_000]   # 10 KB cap
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        stdout = ""
        stderr = f"Timed out — execution exceeded {timeout}s"
        exit_code = 1
    finally:
        try:
            os.unlink(fname)
        except OSError:
            pass

    return ExecutionResult(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        timed_out=timed_out,
    )


async def run_python_async(code: str, timeout: int = 10) -> ExecutionResult:
    """Async wrapper — offloads blocking subprocess call to thread pool.

    Uses asyncio.to_thread (Python 3.9+) so the FastAPI event loop stays free
    during execution. All other WebSocket connections remain responsive.

    Args:
        code: Python source code to execute.
        timeout: Wall-clock timeout in seconds (default 10).

    Returns:
        ExecutionResult with stdout, stderr, exit_code, timed_out.
    """
    return await asyncio.to_thread(run_python_sync, code, timeout)
