// SPDX-FileCopyrightText: Copyright (c) 2026 Ben Williams
// SPDX-FileCopyrightText: Copyright (c) Moeru AI Project AIRI Team
// SPDX-License-Identifier: MIT
// The private backdrop setup comes from electron-window-glass at commit 7a31dea.
// See THIRD-PARTY-LICENSE.txt for the source and license.
#include <node_api.h>
#include <cmath>
#include <cstring>
#include <dlfcn.h>
#include <string>
#include <unordered_set>
#include <vector>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/message.h>

using ConnectionFn = int32_t (*)();
using ChangeTagsFn = CGError (*)(int32_t, int32_t, const int32_t *, size_t);
using ReadTagsFn = CGError (*)(int32_t, int32_t, int32_t *, size_t);

struct PrivateApi {
  ConnectionFn connection;
  ChangeTagsFn setTags;
  ChangeTagsFn clearTags;
  ReadTagsFn readTags;
};

struct RectSpec {
  double x = 0, y = 0, width = 0, height = 0, radius = 0;
  bool operator==(const RectSpec &other) const {
    return x == other.x && y == other.y && width == other.width &&
      height == other.height && radius == other.radius;
  }
};

struct RegionSpec {
  std::string id;
  RectSpec rect;
  double opacity = 0;
  std::vector<RectSpec> clips;
};

@interface BackdropSurfaceView : NSView
@end
@implementation BackdropSurfaceView
- (BOOL)isFlipped { return NO; }
- (BOOL)isOpaque { return NO; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (BOOL)acceptsFirstResponder { return NO; }
@end

@interface BackdropSurface : NSObject {
@public
  RegionSpec spec;
}
@property(nonatomic, strong) BackdropSurfaceView *view;
@property(nonatomic, strong) CALayer *backdrop;
@end
@implementation BackdropSurface
@end

@interface BackdropSession : NSObject {
@public
  PrivateApi api;
}
@property(nonatomic, weak) NSView *host;
@property(nonatomic, weak) NSWindow *window;
@property(nonatomic, strong) NSMutableDictionary<NSString *, BackdropSurface *> *surfaces;
@property(nonatomic, strong) NSColor *originalBackground;
@property(nonatomic) BOOL originalOpaque;
@property(nonatomic, strong) id originalAutoFlatten;
@property(nonatomic, strong) id originalCanHost;
@property(nonatomic) BOOL originalHostWantsLayer;
@property(nonatomic) CGColorRef originalHostBackground;
@property(nonatomic) BOOL addedSwipeTag;
@property(nonatomic) BOOL restored;
@property(nonatomic) BOOL modified;
@property(nonatomic) double blurRadius;
@property(nonatomic) CGError lastTagResult;
@property(nonatomic, strong) id resizeObserver;
@property(nonatomic, strong) id closeObserver;
@end
@implementation BackdropSession
- (void)dealloc {
  if (_originalHostBackground) CGColorRelease(_originalHostBackground);
}
@end

struct EnvState {
  __strong NSMutableDictionary<NSNumber *, BackdropSession *> *sessions;
  int nextId = 1;
};

static constexpr int32_t kNeverFlattenSwipes = 1 << 16;

static napi_value Fail(napi_env env, NSString *message) {
  bool pending = false;
  napi_is_exception_pending(env, &pending);
  if (!pending) napi_throw_error(env, nullptr, message.UTF8String);
  return nullptr;
}

static bool Checked(napi_env env, napi_status status, const char *operation) {
  if (status == napi_ok) return true;
  Fail(env, [NSString stringWithUTF8String:operation]);
  return false;
}

static bool RequireMainThread(napi_env env) {
  if ([NSThread isMainThread]) return true;
  Fail(env, @"Native backdrop requires the Electron main AppKit thread");
  return false;
}

static EnvState *GetState(napi_env env) {
  void *data = nullptr;
  if (!Checked(env, napi_get_instance_data(env, &data), "Cannot read native backdrop environment")) return nullptr;
  return static_cast<EnvState *>(data);
}

static napi_value Undefined(napi_env env) {
  napi_value value;
  if (!Checked(env, napi_get_undefined(env, &value), "Cannot return from native backdrop")) return nullptr;
  return value;
}

static bool IsObject(napi_env env, napi_value value) {
  napi_valuetype type;
  if (!Checked(env, napi_typeof(env, value, &type), "Cannot inspect backdrop value")) return false;
  if (type != napi_object) {
    Fail(env, @"Backdrop regions and clips must be objects");
    return false;
  }
  return true;
}

static bool ReadNumber(napi_env env, napi_value object, const char *key, double &result) {
  napi_value value;
  if (!Checked(env, napi_get_named_property(env, object, key, &value), "Cannot read backdrop property")) return false;
  if (napi_get_value_double(env, value, &result) != napi_ok || !std::isfinite(result) || std::abs(result) > 1000000) {
    Fail(env, [NSString stringWithFormat:@"Backdrop %s must be a finite number within 1000000 points", key]);
    return false;
  }
  return true;
}

static bool ReadRect(napi_env env, napi_value value, RectSpec &rect) {
  if (!IsObject(env, value) ||
      !ReadNumber(env, value, "x", rect.x) || !ReadNumber(env, value, "y", rect.y) ||
      !ReadNumber(env, value, "width", rect.width) || !ReadNumber(env, value, "height", rect.height) ||
      !ReadNumber(env, value, "radius", rect.radius)) return false;
  if (rect.width < 0 || rect.height < 0 || rect.radius < 0) {
    Fail(env, @"Backdrop dimensions and radius must be nonnegative");
    return false;
  }
  return true;
}

static bool ReadArrayLength(napi_env env, napi_value value, uint32_t maximum, uint32_t &length) {
  bool isArray = false;
  if (!Checked(env, napi_is_array(env, value, &isArray), "Cannot inspect backdrop array")) return false;
  if (!isArray) {
    Fail(env, @"Backdrop regions and clips must be arrays");
    return false;
  }
  if (!Checked(env, napi_get_array_length(env, value, &length), "Cannot read backdrop array length")) return false;
  if (length > maximum) {
    Fail(env, [NSString stringWithFormat:@"Backdrop array exceeds its %u item limit", maximum]);
    return false;
  }
  return true;
}

static bool ReadRegions(napi_env env, napi_value value, std::vector<RegionSpec> &regions) {
  uint32_t count;
  if (!ReadArrayLength(env, value, 256, count)) return false;
  std::unordered_set<std::string> ids;
  for (uint32_t index = 0; index < count; index++) {
    napi_value object, idValue, clipsValue;
    RegionSpec region;
    if (!Checked(env, napi_get_element(env, value, index, &object), "Cannot read backdrop region")) return false;
    if (!ReadRect(env, object, region.rect) || !ReadNumber(env, object, "opacity", region.opacity)) return false;
    if (region.opacity < 0 || region.opacity > 1) {
      Fail(env, @"Backdrop opacity must be between 0 and 1");
      return false;
    }
    if (!Checked(env, napi_get_named_property(env, object, "id", &idValue), "Cannot read backdrop id")) return false;
    size_t length;
    if (napi_get_value_string_utf8(env, idValue, nullptr, 0, &length) != napi_ok || length == 0 || length > 128) {
      Fail(env, @"Backdrop id must contain 1 to 128 UTF-8 bytes");
      return false;
    }
    std::vector<char> buffer(length + 1);
    if (!Checked(env, napi_get_value_string_utf8(env, idValue, buffer.data(), buffer.size(), &length), "Cannot decode backdrop id")) return false;
    region.id.assign(buffer.data(), length);
    if (!ids.insert(region.id).second) {
      Fail(env, @"Backdrop region ids must be unique");
      return false;
    }
    if (!Checked(env, napi_get_named_property(env, object, "clips", &clipsValue), "Cannot read backdrop clips")) return false;
    uint32_t clipCount;
    if (!ReadArrayLength(env, clipsValue, 8, clipCount)) return false;
    for (uint32_t clipIndex = 0; clipIndex < clipCount; clipIndex++) {
      napi_value clipValue;
      RectSpec clip;
      if (!Checked(env, napi_get_element(env, clipsValue, clipIndex, &clipValue), "Cannot read backdrop clip")) return false;
      if (!ReadRect(env, clipValue, clip)) return false;
      region.clips.push_back(clip);
    }
    regions.push_back(std::move(region));
  }
  return true;
}

static bool ReadSessionId(napi_env env, napi_value value, int &id) {
  double number;
  if (napi_get_value_double(env, value, &number) != napi_ok || !std::isfinite(number) ||
      number < 1 || number > INT32_MAX || std::floor(number) != number) {
    Fail(env, @"Expected a positive native backdrop session id");
    return false;
  }
  id = static_cast<int>(number);
  return true;
}

static PrivateApi LoadPrivateApi() {
  if (!NSClassFromString(@"CABackdropLayer")) [NSException raise:@"BackdropUnavailable" format:@"CABackdropLayer is unavailable"];
  Class filter = NSClassFromString(@"CAFilter");
  if (!filter || ![filter respondsToSelector:NSSelectorFromString(@"filterWithType:")]) {
    [NSException raise:@"BackdropUnavailable" format:@"CAFilter.filterWithType: is unavailable"];
  }
  PrivateApi api = {
    reinterpret_cast<ConnectionFn>(dlsym(RTLD_DEFAULT, "CGSMainConnectionID")),
    reinterpret_cast<ChangeTagsFn>(dlsym(RTLD_DEFAULT, "CGSSetWindowTags")),
    reinterpret_cast<ChangeTagsFn>(dlsym(RTLD_DEFAULT, "CGSClearWindowTags")),
    reinterpret_cast<ReadTagsFn>(dlsym(RTLD_DEFAULT, "CGSGetWindowTags")),
  };
  if (!api.connection || !api.setTags || !api.clearTags || !api.readTags) {
    [NSException raise:@"BackdropUnavailable" format:@"Required CGS window-tag symbols are unavailable"];
  }
  return api;
}

static CGError ApplySwipeTag(BackdropSession *session) {
  if (!session.window) return kCGErrorInvalidConnection;
  const int32_t tags[2] = {0, kNeverFlattenSwipes};
  return session->api.setTags(session->api.connection(), static_cast<int32_t>(session.window.windowNumber), tags, 0x40);
}

static void RestoreStep(NSMutableArray<NSString *> *errors, void (^step)()) {
  @try { step(); }
  @catch (NSException *exception) { [errors addObject:[NSString stringWithFormat:@"%@: %@", exception.name, exception.reason]]; }
}

static void ClearSurfaces(BackdropSession *session) {
  NSMutableArray<NSString *> *errors = [NSMutableArray new];
  for (BackdropSurface *surface in session.surfaces.allValues) {
    RestoreStep(errors, ^{ surface.view.hidden = YES; });
    RestoreStep(errors, ^{ [surface.view removeFromSuperview]; });
  }
  [session.surfaces removeAllObjects];
  if (errors.count) [NSException raise:@"BackdropSurfaceCleanup" format:@"%@", [errors componentsJoinedByString:@" | "]];
}

// Every restoration step runs. A failed private setter cannot skip unrelated cleanup.
static NSString *Restore(BackdropSession *session) {
  if (session.restored) return nil;
  session.restored = YES;
  NSMutableArray<NSString *> *errors = [NSMutableArray new];
  RestoreStep(errors, ^{ ClearSurfaces(session); });
  RestoreStep(errors, ^{ if (session.resizeObserver) [[NSNotificationCenter defaultCenter] removeObserver:session.resizeObserver]; });
  RestoreStep(errors, ^{ if (session.closeObserver) [[NSNotificationCenter defaultCenter] removeObserver:session.closeObserver]; });
  session.resizeObserver = nil;
  session.closeObserver = nil;
  if (session.modified) {
    NSWindow *window = session.window;
    NSView *host = session.host;
    if (window) {
      if (session.addedSwipeTag) RestoreStep(errors, ^{
        const int32_t tags[2] = {0, kNeverFlattenSwipes};
        CGError result = session->api.clearTags(session->api.connection(), static_cast<int32_t>(window.windowNumber), tags, 0x40);
        if (result != kCGErrorSuccess) [NSException raise:@"BackdropRestoreTags" format:@"CGSClearWindowTags returned %d", result];
      });
      RestoreStep(errors, ^{ [window setValue:session.originalAutoFlatten forKey:@"shouldAutoFlattenLayerTree"]; });
      RestoreStep(errors, ^{ [window setValue:session.originalCanHost forKey:@"canHostLayersInWindowServer"]; });
      RestoreStep(errors, ^{ window.backgroundColor = session.originalBackground; });
      RestoreStep(errors, ^{ window.opaque = session.originalOpaque; });
    }
    if (host) {
      RestoreStep(errors, ^{ host.layer.backgroundColor = session.originalHostBackground; });
      RestoreStep(errors, ^{ host.wantsLayer = session.originalHostWantsLayer; });
    }
  }
  return errors.count ? [errors componentsJoinedByString:@" | "] : nil;
}

static void FinalizeState(napi_env env, void *data, void *hint) {
  EnvState *state = static_cast<EnvState *>(data);
  void (^cleanup)() = ^{
    for (BackdropSession *session in state->sessions.allValues) {
      NSString *error = Restore(session);
      if (error) NSLog(@"[electron-native-backdrop] Environment cleanup failed: %@", error);
    }
    [state->sessions removeAllObjects];
  };
  if ([NSThread isMainThread]) cleanup();
  else dispatch_sync(dispatch_get_main_queue(), cleanup);
  delete state;
}

static BackdropSession *CreateSession(NSView *host, double blurRadius) {
  BackdropSession *session = [BackdropSession new];
  session->api = LoadPrivateApi();
  session.host = host;
  session.window = host.window;
  session.surfaces = [NSMutableDictionary new];
  session.blurRadius = blurRadius;
  session.originalBackground = host.window.backgroundColor;
  session.originalOpaque = host.window.opaque;
  session.originalAutoFlatten = [host.window valueForKey:@"shouldAutoFlattenLayerTree"];
  session.originalCanHost = [host.window valueForKey:@"canHostLayersInWindowServer"];
  session.originalHostWantsLayer = host.wantsLayer;
  if (host.layer.backgroundColor) session.originalHostBackground = CGColorRetain(host.layer.backgroundColor);
  int32_t tags[2] = {0, 0};
  CGError result = session->api.readTags(session->api.connection(), static_cast<int32_t>(host.window.windowNumber), tags, 0x40);
  if (result != kCGErrorSuccess) [NSException raise:@"BackdropReadTags" format:@"CGSGetWindowTags returned %d", result];
  session.addedSwipeTag = !(tags[1] & kNeverFlattenSwipes);
  @try {
    session.modified = YES;
    host.wantsLayer = YES;
    host.layer.backgroundColor = NSColor.clearColor.CGColor;
    host.window.opaque = NO;
    // NOTICE:
    // A clear NSWindow background prevents the private layer from sampling the desktop.
    // The source uses white alpha 0.001 to keep WindowServer compositing active.
    // https://github.com/biw/electron-window-glass/blob/7a31dea/src/bridge.swift
    // Remove this setting when CABackdropLayer supports a fully clear window background.
    host.window.backgroundColor = [NSColor.whiteColor colorWithAlphaComponent:0.001];
    [host.window setValue:@NO forKey:@"shouldAutoFlattenLayerTree"];
    [host.window setValue:@NO forKey:@"canHostLayersInWindowServer"];
    [host.window setValue:@YES forKey:@"canHostLayersInWindowServer"];
    session.lastTagResult = ApplySwipeTag(session);
    if (session.lastTagResult != kCGErrorSuccess) [NSException raise:@"BackdropSetTags" format:@"CGSSetWindowTags returned %d", session.lastTagResult];
  } @catch (NSException *exception) {
    NSString *cleanupError = Restore(session);
    [NSException raise:exception.name format:@"%@%@", exception.reason, cleanupError ? [@". Cleanup: " stringByAppendingString:cleanupError] : @""];
  }
  return session;
}

static BackdropSurface *CreateSurface(BackdropSession *session) {
  BackdropSurface *surface = [BackdropSurface new];
  surface.view = [[BackdropSurfaceView alloc] initWithFrame:NSZeroRect];
  surface.view.wantsLayer = YES;
  surface.view.hidden = YES;
  surface.view.layer.backgroundColor = NSColor.clearColor.CGColor;
  surface.backdrop = [[NSClassFromString(@"CABackdropLayer") alloc] init];
  surface.backdrop.masksToBounds = YES;
  surface.backdrop.allowsEdgeAntialiasing = NO;
  [surface.backdrop setValue:@YES forKey:@"windowServerAware"];
  [surface.backdrop setValue:@YES forKey:@"allowsSubstituteColor"];
  [surface.backdrop setValue:@YES forKey:@"allowsGroupBlending"];
  [surface.backdrop setValue:@YES forKey:@"allowsGroupOpacity"];
  [surface.backdrop setValue:@NO forKey:@"allowsInPlaceFiltering"];
  [surface.backdrop setValue:@YES forKey:@"disablesOccludedBackdropBlurs"];
  [surface.backdrop setValue:@YES forKey:@"ignoresOffscreenGroups"];
  [surface.backdrop setValue:@0.25 forKey:@"scale"];
  [surface.backdrop setValue:@0.0 forKey:@"bleedAmount"];
  Class filter = NSClassFromString(@"CAFilter");
  id blur = ((id (*)(id, SEL, id))objc_msgSend)(filter, NSSelectorFromString(@"filterWithType:"), @"gaussianBlur");
  if (!blur) [NSException raise:@"BackdropUnavailable" format:@"CAFilter gaussianBlur creation failed"];
  [blur setValue:@(session.blurRadius) forKey:@"inputRadius"];
  [blur setValue:@YES forKey:@"inputNormalizeEdges"];
  [surface.backdrop setValue:@[blur] forKey:@"filters"];
  [surface.view.layer addSublayer:surface.backdrop];
  return surface;
}

static CAShapeLayer *RoundedMask(CGRect bounds, CGRect rect, double radius) {
  CAShapeLayer *mask = [CAShapeLayer layer];
  mask.frame = bounds;
  mask.fillColor = NSColor.whiteColor.CGColor;
  CGFloat limitedRadius = MIN(radius, MIN(rect.size.width, rect.size.height) / 2);
  CGPathRef path = CGPathCreateWithRoundedRect(rect, limitedRadius, limitedRadius, nullptr);
  if (!path) [NSException raise:@"BackdropMask" format:@"Could not create a rounded mask"];
  mask.path = path;
  CGPathRelease(path);
  return mask;
}

static void UpdateSurface(BackdropSurface *surface, const RegionSpec &region, NSView *host) {
  const RectSpec &rect = region.rect;
  const RectSpec &previous = surface->spec.rect;
  bool geometryChanged = !(rect == previous) || region.clips != surface->spec.clips;
  CGFloat y = host.isFlipped ? NSMinY(host.bounds) + rect.y : NSMaxY(host.bounds) - rect.y - rect.height;
  surface.view.frame = NSMakeRect(NSMinX(host.bounds) + rect.x, y, rect.width, rect.height);
  surface.view.layer.opacity = region.opacity;
  surface.view.hidden = rect.width == 0 || rect.height == 0 || region.opacity == 0;
  CGRect bounds = CGRectMake(0, 0, rect.width, rect.height);
  surface.backdrop.frame = bounds;
  if (geometryChanged || !surface.backdrop.mask) {
    CAShapeLayer *head = RoundedMask(bounds, bounds, rect.radius);
    CAShapeLayer *tail = head;
    // All masks use the same local bottom-left coordinate system.
    // Nested alpha masks multiply, so every rounded clip intersects the region.
    for (const RectSpec &clip : region.clips) {
      CGRect local = CGRectMake(clip.x - rect.x, rect.height - (clip.y - rect.y) - clip.height, clip.width, clip.height);
      CAShapeLayer *next = RoundedMask(bounds, local, clip.radius);
      tail.mask = next;
      tail = next;
    }
    surface.backdrop.mask = head;
  }
  surface->spec = region;
}

static napi_value Attach(napi_env env, napi_callback_info info) {
  if (!RequireMainThread(env)) return nullptr;
  size_t argc = 3;
  napi_value argv[3];
  if (!Checked(env, napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr), "Cannot read native backdrop arguments")) return nullptr;
  if (argc != 2) return Fail(env, @"attach expects a native handle and blur radius");
  bool isBuffer = false;
  if (!Checked(env, napi_is_buffer(env, argv[0], &isBuffer), "Cannot inspect native backdrop handle")) return nullptr;
  if (!isBuffer) return Fail(env, @"Native backdrop handle must be a Buffer from BrowserWindow.getNativeWindowHandle()");
  void *bytes;
  size_t size;
  if (!Checked(env, napi_get_buffer_info(env, argv[0], &bytes, &size), "Cannot read native backdrop handle")) return nullptr;
  if (size != sizeof(void *)) return Fail(env, @"Native backdrop handle has an invalid pointer size");
  void *pointer = nullptr;
  std::memcpy(&pointer, bytes, size);
  if (!pointer) return Fail(env, @"Native backdrop handle is null");
  double blurRadius;
  if (napi_get_value_double(env, argv[1], &blurRadius) != napi_ok || !std::isfinite(blurRadius) || blurRadius < 0 || blurRadius > 128) return Fail(env, @"Backdrop blur radius must be between 0 and 128");
  EnvState *state = GetState(env);
  if (!state) return nullptr;
  __strong BackdropSession *createdSession = nil;
  int createdId = 0;
  @try {
    NSView *host = (__bridge NSView *)pointer;
    if (![host isKindOfClass:NSView.class] || !host.window) return Fail(env, @"Native backdrop handle does not belong to an attached NSView");
    for (BackdropSession *session in state->sessions.allValues) {
      if (session.window == host.window) return Fail(env, @"This window already owns a native backdrop session");
    }
    BackdropSession *session = CreateSession(host, blurRadius);
    createdSession = session;
    int id = state->nextId++;
    createdId = id;
    state->sessions[@(id)] = session;
    __weak BackdropSession *weakSession = session;
    session.resizeObserver = [[NSNotificationCenter defaultCenter] addObserverForName:NSWindowDidResizeNotification object:host.window queue:nil usingBlock:^(NSNotification *notification) {
      BackdropSession *liveSession = weakSession;
      if (liveSession && !liveSession.restored) liveSession.lastTagResult = ApplySwipeTag(liveSession);
    }];
    session.closeObserver = [[NSNotificationCenter defaultCenter] addObserverForName:NSWindowWillCloseNotification object:host.window queue:nil usingBlock:^(NSNotification *notification) {
      BackdropSession *liveSession = weakSession;
      if (!liveSession) return;
      NSString *error = Restore(liveSession);
      [state->sessions removeObjectForKey:@(id)];
      if (error) NSLog(@"[electron-native-backdrop] Window cleanup failed: %@", error);
    }];
    napi_value result;
    if (!Checked(env, napi_create_int32(env, id, &result), "Cannot return native backdrop session")) {
      Restore(session);
      [state->sessions removeObjectForKey:@(id)];
      return nullptr;
    }
    return result;
  } @catch (NSException *exception) {
    NSString *cleanupError = createdSession ? Restore(createdSession) : nil;
    if (createdId) [state->sessions removeObjectForKey:@(createdId)];
    return Fail(env, [NSString stringWithFormat:@"Native backdrop attach failed: %@: %@%@", exception.name, exception.reason, cleanupError ? [@". Cleanup: " stringByAppendingString:cleanupError] : @""]);
  }
}

static napi_value SetRegions(napi_env env, napi_callback_info info) {
  if (!RequireMainThread(env)) return nullptr;
  size_t argc = 3;
  napi_value argv[3];
  if (!Checked(env, napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr), "Cannot read backdrop regions")) return nullptr;
  if (argc != 2) return Fail(env, @"setRegions expects a session id and region array");
  int id;
  if (!ReadSessionId(env, argv[0], id)) return nullptr;
  EnvState *state = GetState(env);
  if (!state) return nullptr;
  BackdropSession *session = state->sessions[@(id)];
  if (!session || session.restored) return Fail(env, @"Native backdrop session is closed or disposed");
  std::vector<RegionSpec> regions;
  if (!ReadRegions(env, argv[1], regions)) return nullptr;
  @try {
    if (!session.host || !session.window) [NSException raise:@"BackdropClosed" format:@"Native backdrop host is no longer available"];
    if (session.lastTagResult != kCGErrorSuccess) [NSException raise:@"BackdropTags" format:@"Resize CGSSetWindowTags returned %d", session.lastTagResult];
    // Construct every new private layer before changing the visible view hierarchy.
    NSMutableDictionary<NSString *, BackdropSurface *> *next = [NSMutableDictionary new];
    for (const RegionSpec &region : regions) {
      NSString *key = [[NSString alloc] initWithBytes:region.id.data() length:region.id.size() encoding:NSUTF8StringEncoding];
      BackdropSurface *surface = session.surfaces[key];
      if (!surface) surface = CreateSurface(session);
      next[key] = surface;
    }
    NSDictionary<NSString *, BackdropSurface *> *previous = session.surfaces;
    NSMutableDictionary<NSString *, BackdropSurface *> *owned = [session.surfaces mutableCopy];
    [owned addEntriesFromDictionary:next];
    // Keep old and new views owned until the transaction succeeds or cleanup removes both.
    session.surfaces = owned;
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    @try {
      for (NSString *key in previous) {
        if (!next[key]) [previous[key].view removeFromSuperview];
      }
      for (const RegionSpec &region : regions) {
        NSString *key = [[NSString alloc] initWithBytes:region.id.data() length:region.id.size() encoding:NSUTF8StringEncoding];
        BackdropSurface *surface = next[key];
        UpdateSurface(surface, region, session.host);
        if (!surface.view.superview) [session.host addSubview:surface.view positioned:NSWindowBelow relativeTo:nil];
      }
      session.surfaces = next;
    } @finally {
      [CATransaction commit];
    }
    return Undefined(env);
  } @catch (NSException *exception) {
    NSString *cleanupError = Restore(session);
    [state->sessions removeObjectForKey:@(id)];
    return Fail(env, [NSString stringWithFormat:@"Native backdrop update failed: %@: %@%@", exception.name, exception.reason, cleanupError ? [@". Cleanup: " stringByAppendingString:cleanupError] : @""]);
  }
}

static napi_value Detach(napi_env env, napi_callback_info info) {
  if (!RequireMainThread(env)) return nullptr;
  size_t argc = 2;
  napi_value argv[2];
  if (!Checked(env, napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr), "Cannot read backdrop disposal")) return nullptr;
  if (argc != 1) return Fail(env, @"detach expects a native backdrop session id");
  int id;
  if (!ReadSessionId(env, argv[0], id)) return nullptr;
  EnvState *state = GetState(env);
  if (!state) return nullptr;
  BackdropSession *session = state->sessions[@(id)];
  // The native close observer can dispose before BrowserWindow's closed event.
  if (!session) return Undefined(env);
  NSString *error = Restore(session);
  [state->sessions removeObjectForKey:@(id)];
  if (error) return Fail(env, [@"Native backdrop disposal failed: " stringByAppendingString:error]);
  return Undefined(env);
}

static napi_value Init(napi_env env, napi_value exports) {
  // A worker cannot replace the main environment's registry or create AppKit views.
  if (!RequireMainThread(env)) return nullptr;
  EnvState *state = new EnvState();
  state->sessions = [NSMutableDictionary new];
  if (!Checked(env, napi_set_instance_data(env, state, FinalizeState, nullptr), "Cannot initialize native backdrop environment")) {
    delete state;
    return nullptr;
  }
  napi_property_descriptor descriptors[] = {
    {"attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setRegions", nullptr, SetRegions, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"detach", nullptr, Detach, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  if (!Checked(env, napi_define_properties(env, exports, 3, descriptors), "Cannot export native backdrop methods")) return nullptr;
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
