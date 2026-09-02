{
  "targets": [
    {
      "target_name": "lirythme_timing",
      "sources": [ "src/addon.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        [
          "OS=='win'",
          {
            "sources": [ "src/windows/timing_backend_win32.cc" ],
            "defines": [ "WIN32_LEAN_AND_MEAN", "NOMINMAX" ]
          }
        ]
      ]
    }
  ]
}
