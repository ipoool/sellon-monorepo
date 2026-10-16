import 'package:flutter/material.dart';

/// Direct ports of the four shadows in web/src/app/globals.css.
///
/// Flutter's BoxShadow has spreadRadius, which is how the web scale's
/// negative spreads (-5px, -3px) are expressed.
class SellonShadows {
  static const soft = <BoxShadow>[
    BoxShadow(color: Color(0x0A000000), blurRadius: 2, offset: Offset(0, 1)),
  ];

  static const card = <BoxShadow>[
    BoxShadow(color: Color(0x0F000000), blurRadius: 3, offset: Offset(0, 1)),
    BoxShadow(
      color: Color(0x0F000000),
      blurRadius: 2,
      spreadRadius: -1,
      offset: Offset(0, 1),
    ),
  ];

  static const elevated = <BoxShadow>[
    BoxShadow(
      color: Color(0x14000000),
      blurRadius: 25,
      spreadRadius: -5,
      offset: Offset(0, 10),
    ),
    BoxShadow(
      color: Color(0x0A000000),
      blurRadius: 10,
      spreadRadius: -3,
      offset: Offset(0, 4),
    ),
  ];

  static const popout = <BoxShadow>[
    BoxShadow(
      color: Color(0x1F000000),
      blurRadius: 45,
      spreadRadius: -12,
      offset: Offset(0, 20),
    ),
    BoxShadow(
      color: Color(0x0F000000),
      blurRadius: 16,
      spreadRadius: -6,
      offset: Offset(0, 8),
    ),
  ];
}

/// Corner radii, matching what the redesigned web components settled on.
class SellonRadii {
  static const chip = 16.0; // icon chips
  static const card = 16.0;
  static const panel = 24.0; // rounded-3xl
  static const band = 28.0; // the widest panels
  static const pill = 999.0; // every button
}

class SellonSpacing {
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 20.0;
  static const lg = 32.0;
  static const xl = 48.0;
  static const xxl = 72.0;
}
