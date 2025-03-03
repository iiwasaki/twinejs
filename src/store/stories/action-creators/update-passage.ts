import escapeRegExp from 'lodash/escapeRegExp';
import {Thunk} from 'react-hook-thunk-reducer';
import {storyWithId} from '../getters';
import {Passage, StoriesAction, StoriesState, Story} from '../stories.types';
import {createNewlyLinkedPassagesFirebase} from './create-newly-linked-passages-fb';
import {deleteOrphanedPassages} from './delete-orphaned-passages';

/*Firebase*/
import { db } from '../../../firebase-config';

export interface UpdatePassageOptions {
	dontUpdateOthers?: boolean;
}

/**
 * General update of a passage.
 */
export function updatePassage(
	story: Story,
	passage: Passage,
	props: Partial<Passage>,
	options: UpdatePassageOptions = {},
	groupName: string,
	groupCode: string
): Thunk<StoriesState, StoriesAction> {
	if (!story.passages.some(p => p.id === passage.id)) {
		throw new Error ('Error in passage update. This passage may have been recently deleted. Please refresh the page and try again.');
	}

	if (
		'name' in props &&
		story.passages
			.filter(p => p.name === props.name)
			.some(p => p.id !== passage.id)
	) {
		throw new Error(`There is already a passage named "${props.name}".`);
	}

	return (dispatch, getState) => {
		// Do the passage update itself.

		const oldName = passage.name;
		const oldText = passage.text;

		const passageRef = db.collection("passages").doc(groupName).collection("pass").doc(groupCode).collection(story.id).doc(passage.name);

		db.runTransaction((transaction) => {
			return transaction.get(passageRef).then((passageDoc) => {
				if(!passageDoc.exists){
					throw new Error (`Passage named ${passage.name} does not exist; it may have just been deleted or renamed. Please refresh and try again.`)
				}
				transaction.update(passageRef, {text: props.text})
			}).catch((err) => {
				throw new Error (err)
			})
		}).catch ((err) => {
			console.error(`Error in updating passage: ${err}`)
		})

		// db.collection("passages").doc(groupName).collection("pass").doc(groupCode).collection(story.id).doc(passage.name).set({
		// 	text: props.text
		// }, {merge: true})

		// Side effects from changes.

		if (!options.dontUpdateOthers && props.text) {
			dispatch(deleteOrphanedPassages(story, passage, props.text, oldText, groupName, groupCode));

			// We need to get an up-to-date version of the story so placement of new
			// passages is correct.
			//
			// still causes passage bounces sometimes :( this is because the placement
			// algorithm works differently based on the number of passages it sees.
			// will anyone care?? could there be a 'suggested positions'? how would we
			// communicate back and forth?

			const updatedStory = storyWithId(getState(), story.id);

			// Old - this does not work with Firebase.
			// dispatch(
			// 	createNewlyLinkedPassages(updatedStory, passage, props.text, oldText, groupName, groupCode)
			// );

			createNewlyLinkedPassagesFirebase(updatedStory, passage, props.text, oldText, groupName, groupCode)
		}

		if (props.name) {
			const oldNameEscaped = escapeRegExp(oldName);

			// We only need to escape $ stuff in the new name, because it will be the
			// second argument to replace(). This is a little mindbending, but the
			// purpose of this is to replace $ with $$.

			const newNameEscaped = props.name.replace(/\$/g, '$$$$');

			const simpleLinkRegexp = new RegExp(
				'\\[\\[' + oldNameEscaped + '(\\]\\[.*?)?\\]\\]',
				'g'
			);
			const compoundLinkRegexp = new RegExp(
				'\\[\\[(.*?)(\\||->)' + oldNameEscaped + '(\\]\\[.*?)?\\]\\]',
				'g'
			);
			const reverseLinkRegexp = new RegExp(
				'\\[\\[' + oldNameEscaped + '(<-.*?)(\\]\\[.*?)?\\]\\]',
				'g'
			);

			story.passages.forEach(relinkedPassage => {
				if (
					simpleLinkRegexp.test(relinkedPassage.text) ||
					compoundLinkRegexp.test(relinkedPassage.text) ||
					reverseLinkRegexp.test(relinkedPassage.text)
				) {
					let newText = relinkedPassage.text;

					newText = newText.replace(
						simpleLinkRegexp,
						'[[' + newNameEscaped + '$1]]'
					);
					newText = newText.replace(
						compoundLinkRegexp,
						'[[$1$2' + newNameEscaped + '$3]]'
					);
					newText = newText.replace(
						reverseLinkRegexp,
						'[[' + newNameEscaped + '$1$2]]'
					);

					updatePassage(
						story,
						relinkedPassage,
						{text: newText},
						options,
						groupName,
						groupCode
					)(dispatch, getState);
				}
			});
		}
	};
}
