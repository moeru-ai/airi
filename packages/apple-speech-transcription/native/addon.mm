#include <node_api.h>
#include <string>

#import <Foundation/Foundation.h>

#import "AppleSpeechBridge-Swift.h"

namespace {

struct PromiseContext {
  napi_deferred deferred;
  napi_env env;
};

struct PromiseResult {
  NSString* error;
  NSString* json;
};

struct StreamUpdateResult {
  bool complete;
  NSString* error;
  NSString* json;
};

void callJavaScript(napi_env env, napi_value, void* context, void* data) {
  auto* promiseContext = static_cast<PromiseContext*>(context);
  auto* result = static_cast<PromiseResult*>(data);

  if (result->error != nil) {
    napi_value message;
    napi_value error;
    napi_create_string_utf8(env, result->error.UTF8String, NAPI_AUTO_LENGTH, &message);
    napi_create_error(env, nullptr, message, &error);
    napi_reject_deferred(env, promiseContext->deferred, error);
  } else {
    napi_value json;
    napi_create_string_utf8(env, result->json.UTF8String, NAPI_AUTO_LENGTH, &json);
    napi_resolve_deferred(env, promiseContext->deferred, json);
  }

  delete result;
}

void finalizeThreadsafeFunction(napi_env, void* data, void*) {
  delete static_cast<PromiseContext*>(data);
}

void callStreamUpdateJavaScript(napi_env env, napi_value callback, void*, void* data) {
  auto* result = static_cast<StreamUpdateResult*>(data);
  if (env == nullptr) {
    delete result;
    return;
  }

  napi_value undefined;
  napi_get_undefined(env, &undefined);
  napi_value arguments[3] = {undefined, undefined, undefined};
  if (result->json != nil)
    napi_create_string_utf8(env, result->json.UTF8String, NAPI_AUTO_LENGTH, &arguments[0]);
  if (result->error != nil)
    napi_create_string_utf8(env, result->error.UTF8String, NAPI_AUTO_LENGTH, &arguments[1]);
  napi_get_boolean(env, result->complete, &arguments[2]);

  napi_value ignored;
  napi_call_function(env, undefined, callback, 3, arguments, &ignored);
  delete result;
}

napi_threadsafe_function createThreadsafeFunction(napi_env env, napi_deferred deferred) {
  auto* context = new PromiseContext{deferred, env};
  napi_value resourceName;
  napi_create_string_utf8(env, "apple-speech-transcription", NAPI_AUTO_LENGTH, &resourceName);

  napi_threadsafe_function function;
  napi_create_threadsafe_function(
      env,
      nullptr,
      nullptr,
      resourceName,
      0,
      1,
      context,
      finalizeThreadsafeFunction,
      context,
      callJavaScript,
      &function);
  return function;
}

napi_threadsafe_function createStreamThreadsafeFunction(napi_env env, napi_value callback) {
  napi_value resourceName;
  napi_create_string_utf8(env, "apple-speech-transcription-stream", NAPI_AUTO_LENGTH, &resourceName);

  napi_threadsafe_function function;
  napi_create_threadsafe_function(
      env,
      callback,
      nullptr,
      resourceName,
      0,
      1,
      nullptr,
      nullptr,
      nullptr,
      callStreamUpdateJavaScript,
      &function);
  return function;
}

void complete(napi_threadsafe_function function, NSString* json, NSString* error) {
  auto* result = new PromiseResult{[error copy], [json copy]};
  napi_call_threadsafe_function(function, result, napi_tsfn_nonblocking);
  napi_release_threadsafe_function(function, napi_tsfn_release);
}

void sendStreamUpdate(
    napi_threadsafe_function function,
    NSString* json,
    NSString* error,
    bool isComplete) {
  auto* result = new StreamUpdateResult{isComplete, [error copy], [json copy]};
  napi_call_threadsafe_function(function, result, napi_tsfn_nonblocking);
  if (isComplete)
    napi_release_threadsafe_function(function, napi_tsfn_release);
}

napi_value getCapabilities(napi_env env, napi_callback_info) {
  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_threadsafe_function function = createThreadsafeFunction(env, deferred);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge getCapabilitiesWithCompletion:^(NSString* json, NSString* error) {
      complete(function, json, error);
    }];
  } else {
    complete(function, nil, @"Apple Speech transcription requires macOS 26 or later.");
  }

  return promise;
}

bool readString(napi_env env, napi_value value, std::string& output) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok)
    return false;

  output.resize(length + 1);
  size_t copied = 0;
  if (napi_get_value_string_utf8(env, value, output.data(), output.size(), &copied) != napi_ok)
    return false;

  output.resize(copied);
  return true;
}


bool readByteArray(napi_env env, napi_value value, NSData** output) {
  bool isTypedArray = false;
  if (napi_is_typedarray(env, value, &isTypedArray) != napi_ok || !isTypedArray)
    return false;

  napi_typedarray_type arrayType;
  size_t length;
  void* data;
  napi_value arrayBuffer;
  size_t byteOffset;
  if (napi_get_typedarray_info(
          env,
          value,
          &arrayType,
          &length,
          &data,
          &arrayBuffer,
          &byteOffset) != napi_ok)
    return false;
  if (arrayType != napi_uint8_array && arrayType != napi_uint8_clamped_array)
    return false;

  *output = [NSData dataWithBytes:data length:length];
  return true;
}

napi_value transcribeFile(napi_env env, napi_callback_info info) {
  size_t argumentCount = 2;
  napi_value arguments[2];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string path;
  std::string locale;
  if (argumentCount != 2 || !readString(env, arguments[0], path) || !readString(env, arguments[1], locale)) {
    napi_throw_type_error(env, nullptr, "transcribeFile expects an audio path and locale string.");
    return nullptr;
  }

  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_threadsafe_function function = createThreadsafeFunction(env, deferred);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge transcribeFile:[NSString stringWithUTF8String:path.c_str()]
                     localeIdentifier:[NSString stringWithUTF8String:locale.c_str()]
                            completion:^(NSString* json, NSString* error) {
      complete(function, json, error);
    }];
  } else {
    complete(function, nil, @"Apple Speech transcription requires macOS 26 or later.");
  }

  return promise;
}

napi_value transcribeAudio(napi_env env, napi_callback_info info) {
  size_t argumentCount = 3;
  napi_value arguments[3];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  NSData* audio;
  std::string locale;
  std::string fileExtension;
  if (argumentCount != 3 || !readByteArray(env, arguments[0], &audio) || !readString(env, arguments[1], locale) || !readString(env, arguments[2], fileExtension)) {
    napi_throw_type_error(env, nullptr, "transcribeAudio expects Uint8Array audio, a locale, and a file extension.");
    return nullptr;
  }

  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_threadsafe_function function = createThreadsafeFunction(env, deferred);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge transcribeAudio:audio
                      localeIdentifier:[NSString stringWithUTF8String:locale.c_str()]
                          fileExtension:[NSString stringWithUTF8String:fileExtension.c_str()]
                              completion:^(NSString* json, NSString* error) {
      complete(function, json, error);
    }];
  } else {
    complete(function, nil, @"Apple Speech transcription requires macOS 26 or later.");
  }

  return promise;
}

napi_value startStreaming(napi_env env, napi_callback_info info) {
  size_t argumentCount = 3;
  napi_value arguments[3];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string locale;
  int64_t sampleRate;
  napi_valuetype callbackType;
  if (argumentCount != 3
      || !readString(env, arguments[0], locale)
      || napi_get_value_int64(env, arguments[1], &sampleRate) != napi_ok
      || napi_typeof(env, arguments[2], &callbackType) != napi_ok
      || callbackType != napi_function) {
    napi_throw_type_error(env, nullptr, "startStreaming expects a locale, sample rate, and update callback.");
    return nullptr;
  }

  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_threadsafe_function promiseFunction = createThreadsafeFunction(env, deferred);
  napi_threadsafe_function updateFunction = createStreamThreadsafeFunction(env, arguments[2]);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge startStreamingWithLocaleIdentifier:[NSString stringWithUTF8String:locale.c_str()]
                                               sampleRate:static_cast<NSInteger>(sampleRate)
                                                   update:^(NSString* json, NSString* error, BOOL isComplete) {
      sendStreamUpdate(updateFunction, json, error, isComplete);
    }
                                               completion:^(NSString* identifier, NSString* error) {
      complete(promiseFunction, identifier, error);
      if (error != nil)
        sendStreamUpdate(updateFunction, nil, error, true);
    }];
  } else {
    NSString* error = @"Apple Speech transcription requires macOS 26 or later.";
    complete(promiseFunction, nil, error);
    sendStreamUpdate(updateFunction, nil, error, true);
  }

  return promise;
}

napi_value appendStreamingAudio(napi_env env, napi_callback_info info) {
  size_t argumentCount = 2;
  napi_value arguments[2];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string identifier;
  NSData* audio;
  if (argumentCount != 2
      || !readString(env, arguments[0], identifier)
      || !readByteArray(env, arguments[1], &audio)) {
    napi_throw_type_error(env, nullptr, "appendStreamingAudio expects a session identifier and PCM byte array.");
    return nullptr;
  }

  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_threadsafe_function function = createThreadsafeFunction(env, deferred);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge appendStreamingAudioWithSessionIdentifier:[NSString stringWithUTF8String:identifier.c_str()]
                                                           audio:audio
                                                      completion:^(NSString* json, NSString* error) {
      complete(function, json, error);
    }];
  } else {
    complete(function, nil, @"Apple Speech transcription requires macOS 26 or later.");
  }

  return promise;
}

napi_value finishStreaming(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string identifier;
  if (argumentCount != 1 || !readString(env, arguments[0], identifier)) {
    napi_throw_type_error(env, nullptr, "finishStreaming expects a session identifier.");
    return nullptr;
  }

  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_threadsafe_function function = createThreadsafeFunction(env, deferred);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge finishStreamingWithSessionIdentifier:[NSString stringWithUTF8String:identifier.c_str()]
                                                 completion:^(NSString* json, NSString* error) {
      complete(function, json, error);
    }];
  } else {
    complete(function, nil, @"Apple Speech transcription requires macOS 26 or later.");
  }

  return promise;
}

napi_value cancelStreaming(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string identifier;
  if (argumentCount != 1 || !readString(env, arguments[0], identifier)) {
    napi_throw_type_error(env, nullptr, "cancelStreaming expects a session identifier.");
    return nullptr;
  }

  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_threadsafe_function function = createThreadsafeFunction(env, deferred);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge cancelStreamingWithSessionIdentifier:[NSString stringWithUTF8String:identifier.c_str()]
                                                 completion:^(NSString* json, NSString* error) {
      complete(function, json, error);
    }];
  } else {
    complete(function, nil, @"Apple Speech transcription requires macOS 26 or later.");
  }

  return promise;
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"appendStreamingAudio", nullptr, appendStreamingAudio, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"cancelStreaming", nullptr, cancelStreaming, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"finishStreaming", nullptr, finishStreaming, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"getCapabilities", nullptr, getCapabilities, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"startStreaming", nullptr, startStreaming, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"transcribeAudio", nullptr, transcribeAudio, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"transcribeFile", nullptr, transcribeFile, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 7, properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
