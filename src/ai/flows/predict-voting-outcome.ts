'use server';

/**
 * @fileOverview This file defines a Genkit flow for predicting voting outcomes based on historical data and current trends.
 *
 * The flow takes voting data as input and uses an AI model to predict future voting results.
 * It exports a function, predictVotingOutcome, which is the entry point for the flow.
 *
 * @interface PredictVotingOutcomeInput - Defines the input schema for the prediction flow.
 * @interface PredictVotingOutcomeOutput - Defines the output schema for the prediction flow.
 * @function predictVotingOutcome - The main function to trigger the voting outcome prediction.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define the input schema
const PredictVotingOutcomeInputSchema = z.object({
  votingData: z.string().describe('A string summarizing the current votes and any known trends.'),
});

export type PredictVotingOutcomeInput = z.infer<typeof PredictVotingOutcomeInputSchema>;

// Define the output schema for individual predictions
const OutcomePredictionSchema = z.object({
    option: z.string().describe('The name of the voting option (e.g., "Attend Class").'),
    probability: z.number().min(0).max(100).describe('The predicted probability (0-100) of this option being the final winner.')
});

// Define the main output schema
const PredictVotingOutcomeOutputSchema = z.object({
  predictions: z.array(OutcomePredictionSchema).describe('An array of probability predictions for each voting option.')
});

export type PredictVotingOutcomeOutput = z.infer<typeof PredictVotingOutcomeOutputSchema>;

// Exported function to trigger the prediction flow
export async function predictVotingOutcome(input: PredictVotingOutcomeInput): Promise<PredictVotingOutcomeOutput> {
  return predictVotingOutcomeFlow(input);
}

// Define the prompt
const predictVotingOutcomePrompt = ai.definePrompt({
  name: 'predictVotingOutcomePrompt',
  input: {schema: PredictVotingOutcomeInputSchema},
  output: {schema: PredictVotingOutcomeOutputSchema},
  prompt: `You are an AI expert in predicting voting outcomes for a student class vote.
  Based on the current voting data and general trends provided, predict the final winning probability for each option.
  The sum of all probabilities in the 'predictions' array should equal 100.

  Data and Trends: {{{votingData}}}
  `,
});

// Define the flow
const predictVotingOutcomeFlow = ai.defineFlow(
  {
    name: 'predictVotingOutcomeFlow',
    inputSchema: PredictVotingOutcomeInputSchema,
    outputSchema: PredictVotingOutcomeOutputSchema,
  },
  async input => {
    const {output} = await predictVotingOutcomePrompt(input);
    
    // Normalize probabilities to ensure they sum to 100
    if (output?.predictions) {
      const totalProbability = output.predictions.reduce((sum, p) => sum + p.probability, 0);
      if (totalProbability > 0) {
        output.predictions.forEach(p => {
          p.probability = (p.probability / totalProbability) * 100;
        });
      }
       // Final check to eliminate rounding errors, distributing remainder to the max probability
      const sumAfterNormalization = output.predictions.reduce((sum, p) => sum + p.probability, 0);
      const remainder = 100 - sumAfterNormalization;
      if (remainder !== 0 && output.predictions.length > 0) {
        const maxProbIndex = output.predictions.reduce((maxIndex, p, currentIndex, arr) => 
          p.probability > arr[maxIndex].probability ? currentIndex : maxIndex, 0);
        output.predictions[maxProbIndex].probability += remainder;
      }
    }
    
    return output!;
  }
);
