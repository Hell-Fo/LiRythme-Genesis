#include "../timing_backend.h"

#ifndef _WIN32
#error "timing_backend_win32.cc is Windows-only."
#endif

#include <windows.h>

#include <cmath>
#include <cstdint>
#include <limits>

namespace lirythme::timing {
namespace {

constexpr DWORD kCreateWaitableTimerHighResolution = 0x00000002;

BackendResult Success() { return {true, nullptr, 0}; }

BackendResult Failure(const char* operation, DWORD error) {
  return {false, operation, static_cast<std::uint32_t>(error)};
}

class ScopedHandle {
 public:
  explicit ScopedHandle(HANDLE handle) : handle_(handle) {}
  ~ScopedHandle() {
    if (handle_ != nullptr) {
      CloseHandle(handle_);
    }
  }

  ScopedHandle(const ScopedHandle&) = delete;
  ScopedHandle& operator=(const ScopedHandle&) = delete;

  HANDLE get() const { return handle_; }

 private:
  HANDLE handle_;
};

}  // namespace

BackendResult PrepareTimingThread() {
  if (!SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL)) {
    return Failure("SetThreadPriority", GetLastError());
  }

  return Success();
}

BackendResult PreciseSleep(double milliseconds) {
  constexpr double kHundredNanosecondsPerMillisecond = 10000.0;
  constexpr double kMaximumMilliseconds =
      static_cast<double>(std::numeric_limits<std::int64_t>::max()) /
      kHundredNanosecondsPerMillisecond;
  if (milliseconds > kMaximumMilliseconds) {
    return Failure("preciseSleep range check", ERROR_ARITHMETIC_OVERFLOW);
  }

  ScopedHandle timer(CreateWaitableTimerExW(
      nullptr, nullptr, kCreateWaitableTimerHighResolution, TIMER_ALL_ACCESS));
  if (timer.get() == nullptr) {
    return Failure("CreateWaitableTimerExW", GetLastError());
  }

  LARGE_INTEGER due_time;
  const auto ticks = static_cast<std::int64_t>(
      std::ceil(milliseconds * kHundredNanosecondsPerMillisecond));
  due_time.QuadPart = -((ticks > 0) ? ticks : 1);

  if (!SetWaitableTimer(timer.get(), &due_time, 0, nullptr, nullptr, FALSE)) {
    return Failure("SetWaitableTimer", GetLastError());
  }

  const DWORD wait_result = WaitForSingleObject(timer.get(), INFINITE);
  if (wait_result != WAIT_OBJECT_0) {
    return Failure("WaitForSingleObject",
                   wait_result == WAIT_FAILED ? GetLastError() : wait_result);
  }

  return Success();
}

}  // namespace lirythme::timing
