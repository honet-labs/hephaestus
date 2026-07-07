#!/usr/bin/env python3
"""
REST API wrapper for Uptime Kuma's Socket.io API
Enhanced: listens to heartbeat events for live status/uptime/response
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import socketio
import time
import os
from dotenv import load_dotenv
import fnmatch

load_dotenv()

app = Flask(__name__)
CORS(app)

UPTIME_KUMA_URL = os.getenv("UPTIME_KUMA_URL", "http://localhost:3001")
USERNAME = os.getenv("UPTIME_KUMA_USERNAME", "admin")
PASSWORD = os.getenv("UPTIME_KUMA_PASSWORD", "admin")
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "5001"))
API_DEBUG = os.getenv("API_DEBUG", "false").lower() == "true"


class UptimeKumaClient:
    def __init__(self):
        self.sio = None
        self.authenticated = False
        self.monitors_cache = {}
        self.notifications_cache = {}
        self.heartbeats = {}
        self.last_update = 0

    def connect(self):
        self.sio = socketio.Client()

        @self.sio.event
        def connect():
            print(f"Connected to {UPTIME_KUMA_URL}")

        @self.sio.event
        def disconnect():
            print("Disconnected from Uptime Kuma")
            self.authenticated = False

        @self.sio.on("monitorList")
        def on_monitor_list(data):
            self.monitors_cache = data
            self.last_update = time.time()
            print(f"[monitorList] Received {len(data)} monitor(s)")

        @self.sio.on("notificationList")
        def on_notification_list(data):
            self.notifications_cache = data

        @self.sio.on("heartbeat")
        def on_heartbeat(data):
            monitor_id = str(data.get("monitorID", ""))
            if monitor_id not in self.heartbeats:
                self.heartbeats[monitor_id] = []

            self.heartbeats[monitor_id].append({
                "status": data.get("status"),
                "time": data.get("time"),
                "ping": data.get("ping"),
                "msg": data.get("msg", ""),
            })
            if len(self.heartbeats[monitor_id]) > 500:
                self.heartbeats[monitor_id] = self.heartbeats[monitor_id][-500:]

            if monitor_id in self.monitors_cache:
                m = self.monitors_cache[monitor_id]
                m["status"] = data.get("status")
                if data.get("time"):
                    m["lastCheck"] = data["time"]
                if data.get("ping") is not None:
                    m["avgResponse"] = data["ping"]
                m["msg"] = data.get("msg", "")

                total = len(self.heartbeats[monitor_id])
                up_count = sum(1 for h in self.heartbeats[monitor_id] if h.get("status") == 1)
                m["uptime"] = round((up_count / total * 100) if total > 0 else 0, 2)

            print(f"[heartbeat] Monitor {monitor_id}: status={data.get('status')} ping={data.get('ping')}ms")

        try:
            self.sio.connect(UPTIME_KUMA_URL)
            time.sleep(1)
            return True
        except Exception as e:
            print(f"Connection failed: {e}")
            return False

    def authenticate(self):
        if not self.sio or not self.sio.connected:
            return False
        result = {"ok": False}

        def auth_callback(response):
            nonlocal result
            result = response or {"ok": False}

        self.sio.emit("login", {"username": USERNAME, "password": PASSWORD, "token": ""}, callback=auth_callback)
        timeout = 50
        while not result.get("ok") and timeout > 0:
            time.sleep(0.1)
            timeout -= 1

        self.authenticated = result.get("ok", False)
        if self.authenticated:
            print("Authentication successful")
            time.sleep(2)
        else:
            print(f"Authentication failed: {result}")
        return self.authenticated

    def create_monitor(self, monitor_data):
        if not self.authenticated:
            return {"ok": False, "error": "Not authenticated"}
        result = {"ok": False, "error": "No response received"}

        def cb(r):
            nonlocal result
            result = r

        self.sio.emit("add", monitor_data, callback=cb)
        timeout = 100
        while result.get("ok") is False and "No response received" in str(result.get("error", "")) and timeout > 0:
            time.sleep(0.1)
            timeout -= 1
        return result

    def update_monitor(self, monitor_data):
        if not self.authenticated:
            return {"ok": False, "error": "Not authenticated"}
        result = {"ok": False, "error": "No response received"}

        def cb(r):
            nonlocal result
            result = r

        self.sio.emit("editMonitor", monitor_data, callback=cb)
        timeout = 100
        while result.get("ok") is False and "No response received" in str(result.get("error", "")) and timeout > 0:
            time.sleep(0.1)
            timeout -= 1
        return result

    def get_monitors(self):
        if time.time() - self.last_update > 300:
            try:
                self.sio.emit("getMonitorList")
                time.sleep(2)
            except Exception:
                pass
        return self.monitors_cache

    def filter_monitors(self, filters):
        monitors = self.get_monitors()
        results = []
        for monitor_id, monitor in monitors.items():
            if monitor.get("type") == "group" and not filters.get("include_groups", False):
                continue
            match = True
            if "group" in filters:
                parent_id = monitor.get("parent")
                if parent_id:
                    parent = monitors.get(str(parent_id), {})
                    if parent.get("name") != filters["group"]:
                        match = False
                else:
                    match = False
            if "tag" in filters and match:
                tags = [t.get("name", "") for t in monitor.get("tags", [])]
                if filters["tag"] not in tags:
                    match = False
            if "name_pattern" in filters and match:
                if not fnmatch.fnmatch(monitor.get("name", ""), filters["name_pattern"]):
                    match = False
            if "type" in filters and match:
                if monitor.get("type") != filters["type"]:
                    match = False
            if match:
                results.append(monitor)
        return results


kuma_client = UptimeKumaClient()


def extract_filters():
    filters = {}
    if request.is_json and request.json and "filters" in request.json:
        filters.update(request.json["filters"])
    if request.args.get("group"):
        filters["group"] = request.args.get("group")
    if request.args.get("tag"):
        filters["tag"] = request.args.get("tag")
    if request.args.get("name_pattern"):
        filters["name_pattern"] = request.args.get("name_pattern")
    if request.args.get("type"):
        filters["type"] = request.args.get("type")
    if request.args.get("include_groups") == "true":
        filters["include_groups"] = True
    return filters


def connect_to_kuma():
    if kuma_client.connect():
        kuma_client.authenticate()


connect_to_kuma()


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "connected": kuma_client.sio.connected if kuma_client.sio else False,
        "authenticated": kuma_client.authenticated,
    })


@app.route("/connect", methods=["POST"])
def connect():
    success = kuma_client.connect()
    if success:
        auth_success = kuma_client.authenticate()
        return jsonify({"connected": success, "authenticated": auth_success})
    return jsonify({"connected": False, "authenticated": False}), 500


@app.route("/monitors", methods=["GET"])
def list_monitors():
    if not kuma_client.authenticated:
        return jsonify({"error": "Not connected or authenticated"}), 401

    filters = extract_filters()

    if filters:
        monitors = kuma_client.filter_monitors(filters)
        return jsonify({"monitors": monitors, "count": len(monitors)})
    else:
        monitors = kuma_client.get_monitors()
        return jsonify({"monitors": monitors, "count": len(monitors)})


@app.route("/monitors", methods=["POST"])
def create_monitor():
    if not kuma_client.authenticated:
        return jsonify({"error": "Not connected or authenticated"}), 401
    monitor_data = request.json
    if not monitor_data:
        return jsonify({"error": "No monitor data provided"}), 400
    monitor_data.setdefault("type", "http")
    monitor_data.setdefault("method", "GET")
    monitor_data.setdefault("interval", 300)
    monitor_data.setdefault("maxretries", 3)
    monitor_data.setdefault("retryInterval", 60)
    monitor_data.setdefault("timeout", 30)
    monitor_data.setdefault("active", True)
    monitor_data.setdefault("accepted_statuscodes", ["200-299"])
    result = kuma_client.create_monitor(monitor_data)
    if result.get("ok"):
        return jsonify({"success": True, "monitorID": result.get("monitorID"), "message": "Monitor created successfully"})
    return jsonify({"success": False, "error": result.get("msg", "Unknown error")}), 400


@app.route("/monitors/<int:monitor_id>/pause", methods=["POST"])
def pause_monitor(monitor_id):
    if not kuma_client.authenticated:
        return jsonify({"error": "Not connected or authenticated"}), 401
    result = {"ok": False, "error": "No response received"}

    def cb(r):
        nonlocal result
        result = r

    kuma_client.sio.emit("pauseMonitor", monitor_id, callback=cb)
    timeout = 100
    while result.get("ok") is False and "No response received" in str(result.get("error", "")) and timeout > 0:
        time.sleep(0.1)
        timeout -= 1
    if result.get("ok"):
        return jsonify({"success": True, "message": "Monitor paused successfully"})
    return jsonify({"success": False, "error": result.get("msg", "Unknown error")}), 400


@app.route("/monitors/<int:monitor_id>/resume", methods=["POST"])
def resume_monitor(monitor_id):
    if not kuma_client.authenticated:
        return jsonify({"error": "Not connected or authenticated"}), 401
    result = {"ok": False, "error": "No response received"}

    def cb(r):
        nonlocal result
        result = r

    kuma_client.sio.emit("resumeMonitor", monitor_id, callback=cb)
    timeout = 100
    while result.get("ok") is False and "No response received" in str(result.get("error", "")) and timeout > 0:
        time.sleep(0.1)
        timeout -= 1
    if result.get("ok"):
        return jsonify({"success": True, "message": "Monitor resumed successfully"})
    return jsonify({"success": False, "error": result.get("msg", "Unknown error")}), 400


@app.route("/monitors/<int:monitor_id>", methods=["DELETE"])
def delete_monitor(monitor_id):
    if not kuma_client.authenticated:
        return jsonify({"error": "Not connected or authenticated"}), 401
    result = {"ok": False, "error": "No response received"}

    def cb(r):
        nonlocal result
        result = r

    kuma_client.sio.emit("deleteMonitor", monitor_id, callback=cb)
    timeout = 100
    while result.get("ok") is False and "No response received" in str(result.get("error", "")) and timeout > 0:
        time.sleep(0.1)
        timeout -= 1
    if result.get("ok"):
        return jsonify({"success": True, "message": "Monitor deleted successfully"})
    return jsonify({"success": False, "error": result.get("msg", "Unknown error")}), 400


@app.route("/notifications", methods=["GET"])
def list_notifications():
    if not kuma_client.authenticated:
        return jsonify({"error": "Not connected or authenticated"}), 401
    notifications = kuma_client.notifications_cache
    if request.args.get("simple") == "true":
        simple_list = []
        if isinstance(notifications, list):
            for n in notifications:
                simple_list.append({"id": n.get("id"), "name": n.get("name", "Unnamed"), "type": n.get("type", "unknown")})
        else:
            for nid, n in notifications.items():
                simple_list.append({"id": int(nid), "name": n.get("name", "Unnamed"), "type": n.get("type", "unknown")})
        return jsonify({"notifications": simple_list, "count": len(simple_list)})
    return jsonify({"notifications": notifications, "count": len(notifications)})


@app.route("/settings", methods=["GET"])
def get_settings():
    if not kuma_client.authenticated:
        return jsonify({"error": "Not connected or authenticated"}), 401
    result = {"ok": False, "error": "No response received"}

    def cb(r):
        nonlocal result
        result = r

    kuma_client.sio.emit("getSettings", callback=cb)
    timeout = 100
    while result.get("ok") is False and "No response received" in str(result.get("error", "")) and timeout > 0:
        time.sleep(0.1)
        timeout -= 1
    if result.get("ok"):
        return jsonify({"success": True, "settings": result})
    return jsonify({"success": False, "error": "Failed to retrieve settings"}), 400


if __name__ == "__main__":
    print("\n=== Uptime Kuma REST API Wrapper (Enhanced) ===")
    print(f"Will connect to: {UPTIME_KUMA_URL}")
    print(f"Username: {USERNAME}")
    print(f"API will be available at: http://{API_HOST}:{API_PORT}")
    print("Features: heartbeat listener, live status, uptime calc")
    print("================================================\n")
    app.run(host=API_HOST, port=API_PORT, debug=API_DEBUG)
