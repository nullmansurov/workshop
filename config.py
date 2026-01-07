import tkinter as tk
from tkinter import ttk, messagebox
import json
import secrets
import subprocess
import os
import threading
import time
import requests
import webbrowser
import shutil
import sys
import socket

# --- Constants ---
CONFIG_FILE = 'user_config.json'
LOG_FILE = 'log.txt'
INSTANCE_DIR = 'instance'
NGROK_API = 'http://127.0.0.1:4040/api/tunnels'

# --- Modern UI Colors & Fonts ---
COLOR_BG = "#f5f5f5"
COLOR_NAV_BG = "#e9ecef"
COLOR_TEXT = "#212529"
COLOR_PRIMARY_BG = "#cce5ff"
COLOR_DANGER = "#dc3545"
COLOR_SUCCESS = "#28a745"
FONT_FAMILY = ("Segoe UI", "Arial")

# --- Global Variables ---
DEFAULT_CONFIG = {
    "username": "admin", "password": secrets.token_urlsafe(12),
    "role": "admin", "ngrok_token": ""
}
flask_process = None
ngrok_process = None
config = {}
root = None
app = None

try:
    log_file_handle = open(LOG_FILE, 'a', encoding='utf-8')
except IOError as e:
    messagebox.showerror("Log File Error", f"Could not open log file: {e}")
    exit()

# ========== CORE FUNCTIONS ==========

### NEW: A function to determine only the local network IP address. ###
def get_local_ip():
    """
    Determines the computer's IP address on the local network.
    - Returns the IP address if it is found and is not a loopback address.
    - Returns None if the IP could not be determined (e.g., no network connection).
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # A trick to determine the primary network interface
        s.connect(('10.255.255.255', 1))
        ip_address = s.getsockname()[0]
    except Exception:
        return None # Failed to determine IP
    finally:
        s.close()

    # If the IP is 127.0.0.1, it means we are not on a real local network
    if ip_address == '127.0.0.1':
        return None
    else:
        return ip_address

### NEW: Handler function for the new "Open via IP" button ###
def open_workspace_on_ip():
    """Tries to open the workspace using the local network IP address."""
    ip = get_local_ip()
    if ip:
        webbrowser.open(f"http://{ip}:8000")
    else:
        messagebox.showerror(
            "Network Error",
            "Could not determine the local network IP address.\n\n"
            "Make sure you are connected to a network (Wi-Fi or Ethernet)."
        )

def save_config(data):
    """Saves the configuration to a JSON file."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=4)
    global config
    config = data

def run_flask():
    """Starts the Flask application after checking for configuration."""
    global flask_process

    if not os.path.exists(CONFIG_FILE):
        messagebox.showwarning(
            "Configuration Required",
            "The administrator account is not configured.\n\n"
            "Please go to the 'Settings' tab, create an admin user, and click 'Save & Reset Data' before starting the workspace."
        )
        if app:
            app.show_frame("config")
        return

    if flask_process and flask_process.poll() is None:
        messagebox.showinfo("Info", "Workspace is already running.")
        return

    def check_status():
        time.sleep(2)
        if flask_process and flask_process.poll() is not None:
            root.after(0, handle_flask_failure)

    try:
        flask_process = subprocess.Popen(
            [sys.executable, "main.py"],
            stdout=log_file_handle,
            stderr=log_file_handle,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        flask_status_var.set("🟢 Workspace Running")
        flask_status_label.config(foreground=COLOR_SUCCESS)
        threading.Thread(target=check_status, daemon=True).start()

    except FileNotFoundError:
        messagebox.showerror("Error", "Could not find 'main.py'. Please ensure it's in the same folder.")
        stop_flask()
    except Exception as e:
        messagebox.showerror("Error", f"An unexpected error occurred while starting Flask: {e}")
        stop_flask()

def handle_flask_failure():
    """Shows an error message when the workspace fails to start."""
    stop_flask()
    messagebox.showerror(
        "Workspace Failed to Start",
        "The workspace could not be launched. This might be due to a configuration issue.\n\n"
        "Please go to the 'Settings' tab, check your admin login/password, and click 'Save & Reset Data'."
    )

def stop_flask():
    """Stops the Flask application."""
    global flask_process
    if flask_process:
        flask_process.terminate()
        flask_process = None
    flask_status_var.set("🔴 Workspace Stopped")
    flask_status_label.config(foreground=COLOR_DANGER)


def run_ngrok():
    """Starts Ngrok and fetches the public URL."""
    global ngrok_process
    if ngrok_process and ngrok_process.poll() is None:
        messagebox.showinfo("Already Running", "Ngrok is already running.")
        return

    ngrok_path = shutil.which("ngrok")
    if not ngrok_path:
        messagebox.showerror("Error", "Ngrok executable not found in your system's PATH. Please install Ngrok first.")
        return

    def task():
        global ngrok_process
        root.after(0, lambda: ngrok_url_var.set("Starting Ngrok..."))
        token = token_entry.get()
        if not token:
            root.after(0, lambda: messagebox.showerror("Error", "Ngrok token is not specified in Settings."))
            root.after(0, lambda: ngrok_url_var.set("Ngrok not active"))
            return

        auth_process = subprocess.Popen([ngrok_path, "authtoken", token], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        auth_process.wait()

        ngrok_process = subprocess.Popen([ngrok_path, "http", "8000"], stdout=log_file_handle, stderr=log_file_handle, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        root.after(0, lambda: ngrok_url_var.set("Fetching URL (up to 30s)..."))

        for _ in range(15):
            time.sleep(2)
            try:
                res = requests.get(NGROK_API, timeout=2)
                res.raise_for_status()
                public_url = res.json()['tunnels'][0]['public_url']
                if public_url:
                    root.after(0, lambda: ngrok_url_var.set(public_url))
                    return
            except (requests.exceptions.RequestException, IndexError, KeyError):
                continue

        root.after(0, lambda: ngrok_url_var.set("❌ Failed to fetch URL. Check logs."))

    threading.Thread(target=task, daemon=True).start()


def generate_password():
    password_var.set(secrets.token_urlsafe(12))

def copy_password():
    root.clipboard_clear()
    root.clipboard_append(password_var.get())
    messagebox.showinfo("Copied", "Password copied to clipboard.")

def save_admin_config():
    if not messagebox.askyesno("Confirmation", "This will save the administrator configuration and reset all workspace data (sessions, uploaded files, etc.).\n\nContinue?"):
        return

    new_config = {"username": username_entry.get(), "password": password_var.get(), "role": "admin", "ngrok_token": token_entry.get()}
    save_config(new_config)
    stop_flask()
    if os.path.exists(INSTANCE_DIR):
        shutil.rmtree(INSTANCE_DIR)
    messagebox.showinfo("Success", "Administrator settings saved and workspace data has been reset.")

def save_ngrok_token_and_notify():
    if not os.path.exists(CONFIG_FILE):
        messagebox.showwarning("Save Admin First", "Please save the main Administrator Configuration before saving the Ngrok token.")
        app.show_frame("config")
        return

    config['ngrok_token'] = token_entry.get()
    save_config(config)
    messagebox.showinfo("Saved", "Ngrok token saved successfully.")

def on_closing():
    if messagebox.askokcancel("Exit", "Are you sure you want to exit? All running processes will be stopped."):
        if flask_process: flask_process.terminate()
        if ngrok_process: ngrok_process.terminate()
        log_file_handle.close()
        root.destroy()

# ========== GUI (Graphical User Interface) ==========
class Application(tk.Frame):
    def __init__(self, master=None):
        super().__init__(master)
        self.master = master
        self.master.configure(bg=COLOR_BG)
        self.pack(fill="both", expand=True)
        self.frames = {}
        self.create_widgets()
        self.show_frame("control")

    def show_frame(self, page_name):
        frame = self.frames[page_name]
        frame.tkraise()

    def create_widgets(self):
        nav_frame = tk.Frame(self, bg=COLOR_NAV_BG)
        nav_frame.pack(side="top", fill="x", ipady=5)

        buttons = [("Control", "control"), ("Settings", "config")]
        for text, name in buttons:
            btn = tk.Button(nav_frame, text=text, command=lambda name=name: self.show_frame(name),
                          bg=COLOR_NAV_BG, fg=COLOR_TEXT, relief="flat", padx=10, pady=5, font=(FONT_FAMILY[0], 10, "bold"))
            btn.pack(side="left", padx=5)

        container = tk.Frame(self, bg=COLOR_BG)
        container.pack(fill="both", expand=True)
        container.grid_rowconfigure(0, weight=1)
        container.grid_columnconfigure(0, weight=1)

        for F in (ControlPage, ConfigPage):
            page_name = F.__name__.lower().replace("page", "")
            frame = F(parent=container, controller=self)
            self.frames[page_name] = frame
            frame.grid(row=0, column=0, sticky="nsew")

class ThemedPage(tk.Frame):
    def __init__(self, parent, controller):
        tk.Frame.__init__(self, parent, bg=COLOR_BG)
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TFrame', background=COLOR_BG)
        style.configure('TLabel', background=COLOR_BG, foreground=COLOR_TEXT, font=(FONT_FAMILY[0], 10))
        style.configure('Header.TLabel', font=(FONT_FAMILY[0], 14, 'bold'))
        style.configure('TButton', padding=8, relief='flat', font=(FONT_FAMILY[0], 10), background='#e0e0e0')
        style.configure('Primary.TButton', background=COLOR_PRIMARY_BG, foreground=COLOR_TEXT, font=(FONT_FAMILY[0], 10, 'bold'))
        style.map('Primary.TButton', background=[('active', '#b8d6fb')])
        style.configure('Link.TLabel', foreground='#007bff', cursor="hand2")

class ControlPage(ThemedPage):
    def __init__(self, parent, controller):
        super().__init__(parent, controller)
        global flask_status_var, flask_status_label, ngrok_url_var

        main_frame = ttk.Frame(self, padding=25)
        main_frame.pack(fill="both", expand=True)

        ttk.Label(main_frame, text="🚀 Workspace Control", style='Header.TLabel').pack(pady=(0, 10), anchor="w")
        flask_status_var = tk.StringVar(value="🔴 Workspace Stopped")
        flask_status_label = ttk.Label(main_frame, textvariable=flask_status_var, foreground=COLOR_DANGER, font=(FONT_FAMILY[0], 11, 'bold'))
        flask_status_label.pack(anchor="w")

        flask_frame = ttk.Frame(main_frame)
        flask_frame.pack(pady=10, anchor="w")
        ttk.Button(flask_frame, text="▶ Start Workspace", command=run_flask, style='Primary.TButton').pack(side="left", padx=0)
        ttk.Button(flask_frame, text="⏹ Stop Workspace", command=stop_flask).pack(side="left", padx=10)

        ttk.Separator(main_frame).pack(fill="x", pady=20)
        ttk.Label(main_frame, text="🔓 Ngrok Access", style='Header.TLabel').pack(pady=(0, 10), anchor="w")
        ttk.Button(main_frame, text="▶ Start Ngrok", command=run_ngrok, style='Primary.TButton').pack(anchor="w")

        ngrok_url_var = tk.StringVar(value="Ngrok not active")
        ttk.Label(main_frame, text="Public URL:").pack(pady=(10, 0), anchor="w")
        ngrok_url_label = ttk.Label(main_frame, textvariable=ngrok_url_var, style="Link.TLabel")
        ngrok_url_label.pack(anchor="w")
        ngrok_url_label.bind("<Button-1>", lambda e: webbrowser.open(ngrok_url_var.get()) if "http" in ngrok_url_var.get() else None)

        ttk.Separator(main_frame).pack(fill="x", pady=20)
        ### NEW: Header for the button group ###
        ttk.Label(main_frame, text="🔗 Local Access", style='Header.TLabel').pack(pady=(0, 10), anchor="w") 

        link_frame = ttk.Frame(main_frame)
        link_frame.pack(pady=0, anchor="w")

        ### CHANGED: These buttons now always open localhost ###
        ttk.Button(link_frame, text="🌍 Open Workspace (localhost)", command=lambda: webbrowser.open(f"http://localhost:8000")).pack(side="left", padx=0)
        ttk.Button(link_frame, text="🔐 Open Admin (localhost)", command=lambda: webbrowser.open(f"http://localhost:8000/admin")).pack(side="left", padx=10)

        ### NEW: Button to open via local network IP address ###
        ip_button_frame = ttk.Frame(main_frame)
        ip_button_frame.pack(pady=10, anchor="w")
        ttk.Button(ip_button_frame, text="🌐 Open via Local Network IP", command=open_workspace_on_ip).pack(side="left", padx=0)


class ConfigPage(ThemedPage):
    def __init__(self, parent, controller):
        super().__init__(parent, controller)
        global username_entry, password_var, token_entry

        main_frame = ttk.Frame(self, padding=25)
        main_frame.pack(fill="both", expand=True)

        ttk.Label(main_frame, text="👤 Administrator Configuration", style='Header.TLabel').pack(pady=(0, 15), anchor="w")
        ttk.Label(main_frame, text="Username").pack(anchor="w")
        username_entry = ttk.Entry(main_frame, font=(FONT_FAMILY[0], 10))
        username_entry.insert(0, config.get("username", ""))
        username_entry.pack(fill="x", pady=(2, 10))

        ttk.Label(main_frame, text="Password").pack(anchor="w")
        password_var = tk.StringVar(value=config.get("password", ""))
        password_entry = ttk.Entry(main_frame, textvariable=password_var, font=(FONT_FAMILY[0], 10))
        password_entry.pack(fill="x", pady=2)

        pw_frame = ttk.Frame(main_frame)
        pw_frame.pack(pady=10, anchor="w")
        ttk.Button(pw_frame, text="🔄 Generate", command=generate_password).pack(side="left")
        ttk.Button(pw_frame, text="📋 Copy", command=copy_password).pack(side="left", padx=10)

        ttk.Button(main_frame, text="💾 Save & Reset Data", command=save_admin_config, style='Primary.TButton').pack(anchor="w", pady=(10, 0))
        ttk.Label(main_frame, text="Saves login/password and resets workspace data.", font=(FONT_FAMILY[0], 8)).pack(anchor="w")

        ttk.Separator(main_frame).pack(fill="x", pady=20)
        ttk.Label(main_frame, text="🔑 Ngrok Token", style='Header.TLabel').pack(pady=(0, 15), anchor="w")
        token_entry = ttk.Entry(main_frame, font=(FONT_FAMILY[0], 10))
        token_entry.insert(0, config.get("ngrok_token", ""))
        token_entry.pack(fill="x", pady=2)
        ttk.Button(main_frame, text="💾 Save Token", command=save_ngrok_token_and_notify).pack(pady=10, anchor="w")

# ========== APPLICATION STARTUP ==========
if __name__ == "__main__":
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f: config = json.load(f)
        except json.JSONDecodeError: config = DEFAULT_CONFIG
    else: config = DEFAULT_CONFIG

    root = tk.Tk()
    root.title("Workspace Manager")
    # Slightly increase the window height so the new button fits without scrolling
    root.geometry("620x600")
    app = Application(master=root)
    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()