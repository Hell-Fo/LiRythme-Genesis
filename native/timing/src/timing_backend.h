#ifndef LIRYTHME_TIMING_BACKEND_H_
#define LIRYTHME_TIMING_BACKEND_H_

#include <cstdint>

namespace lirythme::timing {

struct BackendResult {
  bool succeeded;
  const char* operation;
  std::uint32_t system_error;
};

BackendResult PrepareTimingThread();
BackendResult PreciseSleep(double milliseconds);

}  // namespace lirythme::timing

#endif  // LIRYTHME_TIMING_BACKEND_H_
