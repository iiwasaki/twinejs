/**
 This automatically triggers a function when typing a word that is prefixed by
 certain text. We use this to automatically pop open the autocomplete when the
 user is probably typing a passage name.

 The format of options to this option is:
	prefixes - an array of strings that will trigger the callback, case-sensitive
	callback - the function that will be called
**/

'use strict';

CodeMirror.defineOption('prefixTrigger', [], function (cm, opts)
{
	if (opts.prefixes && opts.callback)
		cm.on('inputRead', checkTrigger);
	else
		cm.off('inputRead', checkTrigger);

	var prefixes = opts.prefixes;
	var callback = opts.callback;

	function checkTrigger (cm)
	{
		if (cm.state.completionActive)
			return;

		// back up two words from the cursor

		var curWord = cm.findWordAt(cm.getDoc().getCursor());
		curWord.anchor.ch--;
		var prevWordRange = cm.findWordAt(curWord.anchor);
		var prevWord = cm.getRange(prevWordRange.anchor, prevWordRange.head);

		// do we have a match?
		// only trigger this once

		for (var i = prefixes.length; i >= 0; i--)
		{
			if (prevWord == prefixes[i])
			{
				callback();
				return;
			};
		};
	};
});
