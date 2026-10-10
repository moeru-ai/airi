"""Exercise the compiled helper on a fresh private bus. No desktop compositor is contacted."""

import fcntl
import json
import os
import select
import subprocess
import sys
import time
import unittest


if os.environ.get("AIRI_KWIN_PRIVATE_BUS_TEST") != "1":
    environment = dict(os.environ, AIRI_KWIN_PRIVATE_BUS_TEST="1")
    os.execvpe("dbus-run-session", ["dbus-run-session", "--", sys.executable, __file__, *sys.argv[1:]], environment)

HELPER, PEER = sys.argv[1:3]
sys.argv = [sys.argv[0]]


def birth_id(pid):
    with open(f"/proc/{pid}/stat", encoding="utf-8") as source:
        fields = source.read().rsplit(")", 1)[1].split()
    with open("/proc/sys/kernel/random/boot_id", encoding="utf-8") as source:
        return f"{source.read().strip()}:{fields[19]}"


def read_frame(process, timeout=2):
    readable, _, _ = select.select([process.stdout], [], [], timeout)
    if not readable:
        raise AssertionError("Timed out waiting for a bounded protocol response")
    line = process.stdout.readline()
    if not line:
        raise AssertionError(f"Process closed its output, exit={process.poll()}")
    return json.loads(line)


def send(process, frame):
    process.stdin.write(json.dumps(frame, separators=(",", ":")).encode() + b"\n")
    process.stdin.flush()


def start(binary, *arguments):
    return subprocess.Popen([binary, *arguments], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.owner = start(PEER, "--owner")
        self.owner_ready = read_frame(self.owner)
        self.helper = start(HELPER)
        self.ready = read_frame(self.helper)
        self.processes = [self.helper, self.owner]
        self.assertFalse(self.ready["controlAvailable"])
        self.config = {
            "version": 1, "op": "configure", "sessionId": "native-test-session", "surfaceId": "main-stage",
            "windowId": "mock-window-uuid", "resourceClass": "airi-test",
            "process": {"pid": os.getpid(), "birthId": birth_id(os.getpid())},
            "layoutRevision": 1, "nativeMapping": "verified-main-registry-v1",
            "kwinPeer": {"uniqueOwner": self.owner_ready["owner"], "pid": self.owner_ready["pid"], "uid": os.geteuid()},
        }
        self.layout = {
            "coordinateSpace": "kwin-logical-desktop", "revision": 1,
            "outputs": [{"id": "main", "bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
                         "workArea": {"x": 0, "y": 40, "width": 1920, "height": 1040}, "scale": 1.25}],
        }
        self.sequence = 0

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream:
                    stream.close()

    def configure(self):
        send(self.helper, self.config)
        frame = read_frame(self.helper)
        self.assertEqual(frame["type"], "configured")
        self.assertEqual(frame["kwinOwner"], self.owner_ready["owner"])

    def exchange(self, frame, peer=None):
        peer = peer or self.owner
        send(peer, {"destination": self.ready["helperOwner"], "frame": frame})
        return read_frame(peer)

    def hello(self):
        self.sequence += 1
        return {"version": 1, "kind": "hello", "sessionId": self.config["sessionId"],
                "exchangeSequence": self.sequence, "layoutRevision": 1,
                "windowId": self.config["windowId"], "layout": self.layout}

    def poll(self, sample=None, ack=None):
        self.sequence += 1
        return {"version": 1, "kind": "poll", "sessionId": self.config["sessionId"],
                "exchangeSequence": self.sequence, "layoutRevision": 1, "sample": sample, "ack": ack}

    def connect(self):
        self.configure()
        response = self.exchange(self.hello())
        self.assertEqual(response["reply"]["kind"], "ready")
        self.assertEqual(response["reply"]["status"], "active")
        self.assertIsNone(response["reply"]["command"])
        self.assertEqual(read_frame(self.helper)["type"], "exchange")

    def geometry(self, **changes):
        return {"version": 1, "sessionId": self.config["sessionId"], "surfaceId": "main-stage",
                "requestId": "move-one", "sequence": 1, "layoutRevision": 1,
                "createdAtMs": int(time.time() * 1000),
                "bounds": {"x": 120, "y": 100, "width": 220, "height": 300}, **changes}

    def disabled(self, reason):
        while True:
            frame = read_frame(self.helper)
            if frame["type"] == "disabled":
                self.assertEqual(frame["reason"], reason)
                self.helper.wait(timeout=1)
                return

    def test_output_backpressure_never_blocks_parent_disable_or_grows_without_bound(self):
        self.config["sessionId"] = "s" * 128
        self.layout["outputs"][0]["id"] = "o" * 128
        fcntl.fcntl(self.helper.stdout.fileno(), fcntl.F_SETPIPE_SZ, 4096)
        self.connect()
        # Leave helper stdout unread. The bounded queue must terminate before this loop completes.
        terminated = False
        for index in range(200):
            time.sleep(0.05)
            if index % 4 == 0:
                try:
                    send(self.helper, {"version": 1, "op": "heartbeat", "sessionId": self.config["sessionId"]})
                except BrokenPipeError:
                    terminated = True
                    break
            sample = {"coordinateSpace": "kwin-logical-desktop", "source": "kwin-companion-experiment",
                      "sessionId": self.config["sessionId"], "sequence": index + 1, "layoutRevision": 1,
                      "capturedAtMs": int(time.time() * 1000), "position": {"x": 100, "y": 100}, "outputId": "o" * 128}
            response = self.exchange(self.poll(sample=sample))
            if "error" in response:
                terminated = True
                break
        self.assertTrue(terminated)
        self.assertEqual(self.helper.wait(timeout=1), 0)

    def test_enrolled_child_exit_revokes_control(self):
        child = start(sys.executable, "-c", "import time; time.sleep(30)")
        self.processes.append(child)
        self.config["process"] = {"pid": child.pid, "birthId": birth_id(child.pid)}
        self.connect()
        child.terminate()
        child.wait(timeout=1)
        self.disabled("process-identity-revoked")

    def test_handles_fragmented_parent_frames(self):
        payload = json.dumps(self.config).encode() + b"\n"
        self.helper.stdin.write(payload[:20])
        self.helper.stdin.flush()
        time.sleep(0.02)
        self.helper.stdin.write(payload[20:])
        self.helper.stdin.flush()
        self.assertEqual(read_frame(self.helper)["type"], "configured")

    def test_requires_native_registry_proof(self):
        self.config["nativeMapping"] = "unverified"
        send(self.helper, self.config)
        self.disabled("native-enrollment-required")

    def test_rejects_changed_compositor_between_proof_and_configuration(self):
        self.config["kwinPeer"]["uniqueOwner"] = ":1.999999"
        send(self.helper, self.config)
        self.disabled("compositor-identity-unavailable")

    def test_rejects_wrong_process_birth_identity(self):
        self.config["process"]["birthId"] = "reused-pid"
        send(self.helper, self.config)
        self.disabled("process-enrollment-rejected")

    def test_rejects_foreign_process_outside_parent_tree(self):
        self.config["process"] = {"pid": 1, "birthId": birth_id(1)}
        send(self.helper, self.config)
        self.disabled("process-enrollment-rejected")

    def test_authenticates_real_bus_sender_not_payload_claims(self):
        self.connect()
        stranger = start(PEER)
        self.processes.append(stranger)
        read_frame(stranger)
        response = self.exchange(self.poll(), stranger)
        self.assertEqual(response["error"], "org.freedesktop.DBus.Error.AccessDenied")
        time.sleep(0.05)
        response = self.exchange(self.poll())
        self.assertEqual(response["reply"]["status"], "active")

    def test_routes_one_bounded_command_and_acknowledgement(self):
        self.connect()
        command = self.geometry()
        send(self.helper, {"version": 1, "op": "geometry", "request": command})
        time.sleep(0.06)
        response = self.exchange(self.poll())
        self.assertEqual(response["reply"]["command"], command)
        read_frame(self.helper)
        time.sleep(0.06)
        ack = {"requestId": command["requestId"], "sessionId": command["sessionId"], "layoutRevision": 1,
               "outcome": "applied", "reason": "geometry-observed", "observedBounds": command["bounds"]}
        response = self.exchange(self.poll(ack=ack))
        self.assertIsNone(response["reply"]["command"])
        self.assertEqual(read_frame(self.helper)["frame"]["ack"], ack)

    def test_rejects_geometry_outside_work_area(self):
        self.connect()
        send(self.helper, {"version": 1, "op": "geometry", "request": self.geometry(bounds={"x": 100, "y": -20, "width": 220, "height": 300})})
        self.disabled("invalid-geometry-request")

    def test_rejects_other_surface_and_stale_commands(self):
        self.connect()
        send(self.helper, {"version": 1, "op": "geometry", "request": self.geometry(surfaceId="other-application")})
        self.disabled("invalid-geometry-request")

    def test_prevents_geometry_queue_growth(self):
        self.connect()
        send(self.helper, {"version": 1, "op": "geometry", "request": self.geometry()})
        send(self.helper, {"version": 1, "op": "geometry", "request": self.geometry(sequence=2, requestId="move-two")})
        self.disabled("geometry-backpressure")

    def test_allows_poll_delivery_after_compositor_readback_deadline(self):
        self.connect()
        command = self.geometry()
        send(self.helper, {"version": 1, "op": "geometry", "request": command})
        time.sleep(0.06)
        self.exchange(self.poll())
        read_frame(self.helper)
        time.sleep(0.33)
        ack = {"requestId": command["requestId"], "sessionId": command["sessionId"], "layoutRevision": 1,
               "outcome": "applied", "reason": "geometry-observed", "observedBounds": command["bounds"]}
        response = self.exchange(self.poll(ack=ack))
        self.assertEqual(response["reply"]["status"], "active")

    def test_requires_ack_before_deadline(self):
        self.connect()
        send(self.helper, {"version": 1, "op": "geometry", "request": self.geometry()})
        time.sleep(0.06)
        self.exchange(self.poll())
        read_frame(self.helper)
        self.disabled("geometry-acknowledgement-timeout")

    def test_stops_on_owner_change(self):
        self.connect()
        send(self.owner, {"release": True})
        self.assertTrue(read_frame(self.owner)["released"])
        self.disabled("compositor-owner-changed")

    def test_stops_on_parent_eof(self):
        self.connect()
        self.helper.stdin.close()
        self.disabled("parent-eof")

    def test_stops_immediately_on_explicit_disable(self):
        self.connect()
        send(self.helper, {"version": 1, "op": "disable", "sessionId": self.config["sessionId"]})
        self.disabled("user-disabled")

    def test_parent_lease_cannot_be_revived_by_late_heartbeat(self):
        self.configure()
        self.disabled("parent-lease-expired")

    def test_script_lease_expires_while_parent_stays_alive(self):
        self.connect()
        for _ in range(4):
            time.sleep(0.22)
            send(self.helper, {"version": 1, "op": "heartbeat", "sessionId": self.config["sessionId"]})
        self.disabled("script-lease-expired")

    def test_rejects_oversized_partial_parent_frame(self):
        self.helper.stdin.write(b"x" * 8193)
        self.helper.stdin.flush()
        self.disabled("parent-frame-too-large")

    def test_rejects_invalid_utf8(self):
        self.helper.stdin.write(b'{"version":1,"op":"\xff"}\n')
        self.helper.stdin.flush()
        self.disabled("invalid-parent-frame")

    def test_rejects_unknown_fields(self):
        send(self.helper, {**self.config, "arbitraryWindow": "another-app"})
        self.disabled("native-enrollment-required")

    def test_rejects_replayed_exchange(self):
        self.configure()
        hello = self.hello()
        self.exchange(hello)
        read_frame(self.helper)
        response = self.exchange(hello)
        self.assertIn("error", response)
        self.disabled("invalid-exchange-frame")

    def test_rejects_oversized_bus_frame(self):
        self.configure()
        send(self.owner, {"destination": self.ready["helperOwner"], "raw": "x" * 8193})
        self.assertIn("error", read_frame(self.owner))
        self.disabled("invalid-exchange-frame")

    def test_rejects_duplicate_output_ids(self):
        self.configure()
        self.layout["outputs"].append(self.layout["outputs"][0])
        self.assertIn("error", self.exchange(self.hello()))
        self.disabled("invalid-exchange-frame")

    def test_rejects_stale_pointer_samples(self):
        self.connect()
        time.sleep(0.05)
        sample = {"coordinateSpace": "kwin-logical-desktop", "source": "kwin-companion-experiment",
                  "sessionId": self.config["sessionId"], "sequence": 1, "layoutRevision": 1,
                  "capturedAtMs": int(time.time() * 1000) - 500, "position": {"x": 100, "y": 100}, "outputId": "main"}
        self.assertIn("error", self.exchange(self.poll(sample=sample)))
        self.disabled("invalid-exchange-frame")


if __name__ == "__main__":
    unittest.main(verbosity=2)
