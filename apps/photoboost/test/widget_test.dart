import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/main.dart';

void main() {
  testWidgets('idle screen invites a passer-by to start', (tester) async {
    // A tablet, not a phone: the layout assumes landscape at this size.
    await tester.binding.setSurfaceSize(const Size(1280, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const PhotoBoostApp());

    expect(find.text('PHOTO BOOTH'), findsOneWidget);
    expect(find.text('Mulai'), findsOneWidget);
    // The four steps are the whole promise; losing one would leave a customer
    // unsure what they are paying for.
    expect(find.text('Scan & bayar'), findsOneWidget);
    expect(find.text('4 kali foto'), findsOneWidget);
    expect(find.text('Pilih bingkai'), findsOneWidget);
    expect(find.text('Ambil cetakan'), findsOneWidget);
  });
}
