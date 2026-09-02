#include <napi.h>

#include <cmath>
#include <string>

#include "timing_backend.h"

namespace {

void ThrowBackendError(const Napi::Env& env,
                       const lirythme::timing::BackendResult& result) {
  Napi::Error::New(env, std::string(result.operation) +
                            " failed with system error " +
                            std::to_string(result.system_error))
      .ThrowAsJavaScriptException();
}

Napi::Value PrepareTimingThread(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  const auto result = lirythme::timing::PrepareTimingThread();
  if (!result.succeeded) {
    ThrowBackendError(env, result);
    return env.Undefined();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value PreciseSleep(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() != 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "preciseSleep(milliseconds) expects one number")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const double milliseconds = info[0].As<Napi::Number>().DoubleValue();
  if (!std::isfinite(milliseconds) || milliseconds < 0.0) {
    Napi::RangeError::New(env, "milliseconds must be finite and non-negative")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const auto result = lirythme::timing::PreciseSleep(milliseconds);
  if (!result.succeeded) {
    ThrowBackendError(env, result);
    return env.Undefined();
  }

  return env.Undefined();
}

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  exports.Set("prepareTimingThread", Napi::Function::New(env, PrepareTimingThread));
  exports.Set("preciseSleep", Napi::Function::New(env, PreciseSleep));
  return exports;
}

}  // namespace

NODE_API_MODULE(lirythme_timing, Initialize)
